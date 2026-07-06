import { Plugin, MarkdownView } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { reactiveVariablesExtension } from "./reactive/cm-extension";
import { createPreviewProcessor } from "./reactive/preview";
import {
  DEFAULT_SETTINGS,
  ReactiveVariablesSettings,
  ReactiveVariablesSettingTab
} from "./settings";
import {
  parseDeclarations,
  findWrapperMatchesInText,
  stripVariables,
  RuleEntry,
  WrapperMatch,
  isColorString
} from "./reactive/engine";
import {
  getEnabledStyles,
  getTextSizeCssVar,
  hasEnabledStyles
} from "./reactive/utils";
import { SpatialOverlayManager, CreateStickyNoteModal, parseNotesFromView } from "./ui/spatial-overlay";
import { LayoutPresetModal } from "./templates";

interface IdentifiableLeaf {
  id: string;
}

const SIDEBAR_STYLE_ID = "concrete-hide-pasted-images";
const PASTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

function compileToHTML(
  text: string,
  from: number,
  to: number,
  matches: WrapperMatch[],
  rules: Map<string, RuleEntry>,
  options: ReactiveVariablesSettings
): string {
  let html = "";
  let index = from;
  const innerMatches = matches.filter(m => m.fullFrom >= from && m.fullTo <= to);

  while (index < to) {
    const nextMatch = innerMatches.find(m => m.fullFrom >= index);
    if (!nextMatch) {
      html += escapeHTML(text.slice(index, to));
      break;
    }

    if (nextMatch.fullFrom > index) {
      html += escapeHTML(text.slice(index, nextMatch.fullFrom));
    }

    let styleStr = "";
    for (const style of getEnabledStyles(nextMatch.rule, options)) {
      if (style.section === "colors" || isColorString(style.val)) {
        styleStr += `color: ${style.val};`;
      } else {
        if (style.val === "bold") {
          styleStr += "font-weight: bold;";
        } else if (style.val === "italic") {
          styleStr += "font-style: italic;";
        } else if (style.val === "underline") {
          styleStr += "text-decoration: underline;";
        } else if (style.val === "strikethrough") {
          styleStr += "text-decoration: line-through;";
        } else if (style.val === "highlight") {
          styleStr += "background-color: #fff5b1;";
        } else if (style.val === "header") {
          styleStr += "font-weight: bold;";
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          } else {
            styleStr += "font-size: 1.5em;";
          }
        } else if (style.val === "paragraph") {
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          } else {
            styleStr += "font-size: 1em;";
          }
        } else {
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          }
        }
      }
    }

    const innerContent = compileToHTML(text, nextMatch.contentFrom, nextMatch.contentTo, innerMatches, rules, options);
    if (styleStr) {
      html += `<span style="${styleStr}">${innerContent}</span>`;
    } else {
      html += innerContent;
    }

    index = nextMatch.fullTo;
  }

  return html;
}

export default class ReactiveVariablesPlugin extends Plugin {
  settings: ReactiveVariablesSettings;
  spatialOverlayManager: SpatialOverlayManager;

  async onload() {
    await this.loadSettings();

    this.spatialOverlayManager = new SpatialOverlayManager(this);

    if (this.settings.enableEditor) {
      this.registerEditorExtension(reactiveVariablesExtension(this.settings));
    }

    if (this.settings.enablePreview) {
      this.registerMarkdownPostProcessor(createPreviewProcessor(this.app, this.settings));
    }

    // Register active layout presets ribbon and commands
    this.addRibbonIcon("layout", "Concrete layout presets", () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        new LayoutPresetModal(this.app, (preset) => {
          const editor = activeView.editor;
          const currentContent = editor.getValue();
          const newContent = preset.varsBlock + "\n\n" + currentContent;
          editor.setValue(newContent);
        }).open();
      }
    });

    this.addCommand({
      id: "insert-layout-preset",
      name: "Insert layout preset",
      editorCallback: (editor) => {
        new LayoutPresetModal(this.app, (preset) => {
          const currentContent = editor.getValue();
          const newContent = preset.varsBlock + "\n\n" + currentContent;
          editor.setValue(newContent);
        }).open();
      }
    });

    this.addCommand({
      id: "create-sticky-note",
      name: "Create sticky note",
      editorCallback: async (editor, view) => {
        if (view instanceof MarkdownView) {
          const { defaults } = await parseNotesFromView(this.app, view, this.settings.globalVars);
          const defaultSize = defaults.noteSize || this.settings.defaultNoteSize || "200x150";

          new CreateStickyNoteModal(this.app, defaultSize, (name, size) => {
            void this.spatialOverlayManager.addNoteFromUI(view, name, size);
          }).open();
        }
      }
    });

    // Register spatial notes events
    this.app.workspace.onLayoutReady(() => {
      void this.spatialOverlayManager.reconcile();
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.spatialOverlayManager.reconcile();
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        void this.spatialOverlayManager.reconcile();
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        void this.spatialOverlayManager.reconcile();
      })
    );

    // Register editor menu hooks for copy and sticky notes context options
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (view instanceof MarkdownView) {
          menu.addItem((item) => {
            item
              .setTitle("Copy content without variables")
              .setIcon("copy")
              .onClick(async () => {
                const selection = editor.getSelection();
                const docContent = editor.getValue();
                const doc = CmText.of(docContent.split("\n"));
                const { rules } = parseDeclarations(doc, this.settings.globalVars);
                
                const targetText = selection ? selection : docContent;
                const plainText = stripVariables(targetText);
                const wrappers = Array.from(rules.values()).filter(r => r.type === "wrapper" && hasEnabledStyles(r, this.settings));
                const matches = findWrapperMatchesInText(targetText, 0, wrappers);
                const htmlText = compileToHTML(targetText, 0, targetText.length, matches, rules, this.settings);
                
                const blobPlain = new Blob([plainText], { type: "text/plain" });
                const blobHTML = new Blob([htmlText], { type: "text/html" });
                const data = new ClipboardItem({
                  "text/plain": blobPlain,
                  "text/html": blobHTML
                });
                await navigator.clipboard.write([data]);
              });
          });

          menu.addItem((item) => {
            item
              .setTitle("Create sticky note")
              .setIcon("pin")
              .onClick(async () => {
                const { defaults } = await parseNotesFromView(this.app, view, this.settings.globalVars);
                const defaultSize = defaults.noteSize || this.settings.defaultNoteSize || "200x150";

                new CreateStickyNoteModal(this.app, defaultSize, (name, size) => {
                  void this.spatialOverlayManager.addNoteFromUI(view, name, size);
                }).open();
              });
          });
        }
      })
    );

    // Intercept standard copy event in editor to write dual-flavor style payload
    this.registerDomEvent(activeWindow, "copy", (evt: ClipboardEvent) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      const editor = view.editor;
      const selection = editor.getSelection();
      if (!selection) return;

      evt.preventDefault();
      
      const docContent = editor.getValue();
      const doc = CmText.of(docContent.split("\n"));
      const { rules } = parseDeclarations(doc, this.settings.globalVars);
      
      const plainText = stripVariables(selection);
      const wrappers = Array.from(rules.values()).filter(r => r.type === "wrapper" && hasEnabledStyles(r, this.settings));
      const matches = findWrapperMatchesInText(selection, 0, wrappers);
      const htmlText = compileToHTML(selection, 0, selection.length, matches, rules, this.settings);
      
      evt.clipboardData?.setData("text/plain", plainText);
      evt.clipboardData?.setData("text/html", htmlText);
    });

    this.applySidebarStyles();
    this.addSettingTab(new ReactiveVariablesSettingTab(this.app, this));
  }

  onunload() {
    this.removeSidebarStyles();
    this.spatialOverlayManager.destroyAll();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ReactiveVariablesSettings>
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applySidebarStyles();
    void this.spatialOverlayManager.reconcile();
  }

  private applySidebarStyles() {
    this.removeSidebarStyles();
    if (this.settings.hidePastedImagesInSidebar) {
      const style = activeDocument.createElement("style");
      style.id = SIDEBAR_STYLE_ID;
      const selectors = PASTED_IMAGE_EXTENSIONS.flatMap((extension) => [
        `.nav-file:has(.nav-file-title[data-path*="Pasted image"][data-path$=".${extension}" i])`,
        `.nav-file-title[data-path*="Pasted image"][data-path$=".${extension}" i]`
      ]);
      style.textContent = `${selectors.join(",\n")} { display: none !important; }`;
      activeDocument.head.appendChild(style);
    }
  }

  private removeSidebarStyles() {
    const existing = activeDocument.getElementById(SIDEBAR_STYLE_ID);
    if (existing) existing.remove();
  }
}
