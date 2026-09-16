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
  stripVariables
} from "./reactive/engine";
import {
  compileToHTML,
  hasEnabledStyles
} from "./reactive/utils";
import { LayoutPresetModal } from "./templates";

export default class ReactiveVariablesPlugin extends Plugin {
  settings: ReactiveVariablesSettings;

  async onload() {
    await this.loadSettings();

    if (this.settings.enableEditor) {
      this.registerEditorExtension(reactiveVariablesExtension(this.settings));
    }

    if (this.settings.enablePreview) {
      this.registerMarkdownPostProcessor(createPreviewProcessor(this.app, this.settings));
    }

    // Ribbon icon for Layout Presets
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

    // Register editor menu hook for copy context option
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
        }
      })
    );

    // Intercept copy event in editor to write dual-flavor style payload cleanly
    this.registerDomEvent(window, "copy", (evt: ClipboardEvent) => {
      this.handleCopyEvent(evt);
    });

    this.registerEvent(
      this.app.workspace.on("window-open", (_leaf, win) => {
        this.registerDomEvent(win, "copy", (evt: ClipboardEvent) => {
          this.handleCopyEvent(evt);
        });
      })
    );

    this.addSettingTab(new ReactiveVariablesSettingTab(this.app, this));
  }

  private handleCopyEvent(evt: ClipboardEvent) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const targetNode = evt.target as Node | null;
    if (!targetNode || !view.contentEl.contains(targetNode)) return;

    const editor = view.editor;
    if (!editor.hasFocus()) return;

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
  }
}
