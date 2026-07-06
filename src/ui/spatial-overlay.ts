import { App, MarkdownView, Modal, Setting, Notice } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { parseDeclarations, resolveColorNameOrAbbrev } from "../reactive/engine";
import ReactiveVariablesPlugin from "../main";

interface IdentifiableLeaf {
  id: string;
}

export interface NoteDefaults {
  textSize?: string;
  textColour?: string;
  noteSize?: string;
  noteColour?: string;
}

export interface StickyNoteData {
  id: string;
  name: string;
  w: number;
  h: number;
  x: number;
  y: number;
  placed: boolean;
}

export class CreateStickyNoteModal extends Modal {
  private name: string = "";
  private size: string = "";

  constructor(
    app: App,
    private defaultSize: string,
    private onSubmit: (name: string, size: string) => void
  ) {
    super(app);
    this.size = defaultSize;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Create sticky note" });

    new Setting(contentEl)
      .setName("Note name")
      .setDesc("The title / label of the sticky note.")
      .addText((text) => {
        text.setPlaceholder("Formulas");
        text.onChange((val) => {
          this.name = val.trim();
        });
        setTimeout(() => text.inputEl.focus(), 100);
      });

    new Setting(contentEl)
      .setName("Sizing")
      .setDesc("The width and height of the note (e.g. 200x150 or 30x30).")
      .addText((text) => {
        text.setValue(this.size);
        text.onChange((val) => {
          this.size = val.trim();
        });
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            if (this.name) {
              this.onSubmit(this.name, this.size);
              this.close();
            } else {
              new Notice("Please enter a note name.");
            }
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Inline modern SVG icon markup strings
const ICON_DELETE_SVG = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

/**
 * Safely parses an SVG string via DOMParser and returns a cloned SVG element.
 * This avoids using innerHTML which is disallowed by the SDL lint rule.
 */
function safeSvgElement(svgMarkup: string): SVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  return doc.documentElement.cloneNode(true) as SVGElement;
}

/**
 * Replaces all child nodes of an element with the parsed SVG from markup.
 */
function setSvgContent(el: HTMLElement, svgMarkup: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(safeSvgElement(svgMarkup));
}

export class RenameStickyNoteModal extends Modal {
  private name: string;
  private onSubmit: (newName: string) => void;

  constructor(app: App, currentName: string, onSubmit: (newName: string) => void) {
    super(app);
    this.name = currentName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Rename sticky note" });

    new Setting(contentEl)
      .setName("Note name")
      .addText((text) => {
        text.setValue(this.name);
        text.onChange((val) => {
          this.name = val.trim();
        });
        setTimeout(() => text.inputEl.focus(), 100);
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Rename")
          .setCta()
          .onClick(() => {
            if (this.name) {
              this.onSubmit(this.name);
              this.close();
            } else {
              new Notice("Please enter a note name.");
            }
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function serializeNotes(notes: Map<string, StickyNoteData>, existingNotesSection: string): string {
  const defaults = new Map<string, string>();
  const lines = existingNotesSection.split("\n");
  for (const line of lines) {
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(":::")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (key === "text_size" || key === "text_colour" || key === "note_size" || key === "note_colour") {
      defaults.set(key, val);
    }
  }

  const outputLines = ["##notes"];
  for (const [key, val] of defaults) {
    outputLines.push(`${key} = ${val}`);
  }
  for (const note of notes.values()) {
    if (note.placed) {
      outputLines.push(`${note.name} = ${Math.round(note.w)},${Math.round(note.h)},${Math.round(note.x)},${Math.round(note.y)}`);
    } else {
      outputLines.push(`${note.name} = ${Math.round(note.w)},${Math.round(note.h)}`);
    }
  }
  return outputLines.join("\n");
}

export function updateNotesInDocument(content: string, notes: Map<string, StickyNoteData>): string {
  const lines = content.split("\n");
  let blockStartIdx = -1;
  let blockEndIdx = -1;
  let hasNotesHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    if (lineRaw === undefined) continue;
    const line = lineRaw.trim();
    if (line === ":::vars") {
      blockStartIdx = i;
      hasNotesHeader = false;
    } else if (line === ":::") {
      if (blockStartIdx !== -1 && hasNotesHeader) {
        blockEndIdx = i;
        break;
      }
      blockStartIdx = -1;
    } else if (blockStartIdx !== -1 && (line.toLowerCase().startsWith("#notes") || line.toLowerCase().startsWith("##notes"))) {
      hasNotesHeader = true;
    }
  }

  if (blockStartIdx !== -1 && blockEndIdx !== -1) {
    const blockLines = lines.slice(blockStartIdx + 1, blockEndIdx);
    const existingSectionText = blockLines.join("\n");
    const newSectionText = serializeNotes(notes, existingSectionText);
    const before = lines.slice(0, blockStartIdx + 1);
    const after = lines.slice(blockEndIdx);
    return [...before, newSectionText, ...after].join("\n");
  } else {
    let anyBlockStart = -1;
    let anyBlockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineRaw = lines[i];
      if (lineRaw === undefined) continue;
      const line = lineRaw.trim();
      if (line === ":::vars") {
        anyBlockStart = i;
      } else if (line === ":::") {
        if (anyBlockStart !== -1) {
          anyBlockEnd = i;
          break;
        }
      }
    }

    if (anyBlockStart !== -1 && anyBlockEnd !== -1) {
      const before = lines.slice(0, anyBlockEnd);
      const after = lines.slice(anyBlockEnd);
      const newSectionText = serializeNotes(notes, "");
      return [...before, "", newSectionText, ...after].join("\n");
    } else {
      const newSectionText = serializeNotes(notes, "");
      return content + `\n\n:::vars\n${newSectionText}\n:::\n`;
    }
  }
}

export async function parseNotesFromView(app: App, view: MarkdownView, globalVars?: string): Promise<{
  notes: Map<string, StickyNoteData>;
  defaults: NoteDefaults;
}> {
  const notes = new Map<string, StickyNoteData>();
  const defaults: NoteDefaults = {};

  const file = view.file;
  if (!file) return { notes, defaults };

  let content = "";
  if (view.editor) {
    content = view.editor.getValue();
  } else {
    content = await app.vault.cachedRead(file);
  }
  if (!content) return { notes, defaults };

  const doc = CmText.of(content.split("\n"));
  const { rules } = parseDeclarations(doc, globalVars);

  for (const [key, entry] of rules) {
    const lastStyle = entry.styles[entry.styles.length - 1];
    if (!lastStyle) continue;

    if (lastStyle.section === "notes") {
      if (key === "text_size") defaults.textSize = lastStyle.val;
      else if (key === "text_colour") defaults.textColour = lastStyle.val;
      else if (key === "note_size") defaults.noteSize = lastStyle.val;
      else if (key === "note_colour") defaults.noteColour = lastStyle.val;
      else {
        const parts = lastStyle.val.split(",");
        if (parts.length >= 2) {
          const w = parseFloat(parts[0] || "200") || 200;
          const h = parseFloat(parts[1] || "150") || 150;
          let x = 0;
          let y = 0;
          let placed = false;
          if (parts.length >= 4) {
            x = parseFloat(parts[2] || "0");
            y = parseFloat(parts[3] || "0");
            placed = true;
          }
          notes.set(key, { id: key, name: key, w, h, x, y, placed });
        }
      }
    }
  }

  return { notes, defaults };
}

export class SpatialOverlayManager {
  private activeOverlays = new Map<string, HTMLElement>();
  private activeNotes = new Map<string, Map<string, StickyNoteData>>();
  private pendingSaveLeaves = new Set<string>();
  private saveTimeout: number | null = null;
  public lastContextClick = { x: 100, y: 100 };
  private placingNotes = new Set<string>();
  private placementCleanups = new Map<string, () => void>();

  constructor(private plugin: ReactiveVariablesPlugin) {
    this.plugin.registerDomEvent(activeWindow, "contextmenu", (e: MouseEvent) => {
      this.lastContextClick = { x: e.clientX, y: e.clientY };
    });
  }

  getOverlayElement(leafId: string): HTMLElement | undefined {
    return this.activeOverlays.get(leafId);
  }

  async reconcile() {
    return;
  }

  private async ensureOverlay(leafId: string, view: MarkdownView) {
    let overlayEl = this.activeOverlays.get(leafId);
    if (!overlayEl || !overlayEl.isConnected) {
      overlayEl = activeDocument.createElement("div");
      overlayEl.className = "concrete-spatial-overlay";
      setStyle(overlayEl, "position", "absolute");
      setStyle(overlayEl, "top", "0");
      setStyle(overlayEl, "left", "0");
      setStyle(overlayEl, "width", "100%");
      setStyle(overlayEl, "height", "100%");
      setStyle(overlayEl, "pointer-events", "none");
      setStyle(overlayEl, "z-index", "100");
      setStyle(overlayEl, "overflow", "visible");

      const container = view.contentEl;
      setStyle(container, "position", "relative");
      container.appendChild(overlayEl);
      this.activeOverlays.set(leafId, overlayEl);
    }

    await this.renderNotes(leafId, view, overlayEl);
  }

  private async renderNotes(leafId: string, view: MarkdownView, overlayEl: HTMLElement) {
    const { notes, defaults } = await parseNotesFromView(this.plugin.app, view, this.plugin.settings.globalVars);
    
    // Resolve merged settings and document defaults
    const resolvedDefaults: NoteDefaults = {
      textSize: defaults.textSize || this.plugin.settings.defaultNoteTextSize || "14px",
      textColour: resolveColorNameOrAbbrev(defaults.textColour || this.plugin.settings.defaultNoteTextColour || ""),
      noteSize: defaults.noteSize || this.plugin.settings.defaultNoteSize || "200x150",
      noteColour: resolveColorNameOrAbbrev(defaults.noteColour || this.plugin.settings.defaultNoteColour || "")
    };

    let notesToRender = notes;
    if (this.pendingSaveLeaves.has(leafId)) {
      const inMemory = this.activeNotes.get(leafId);
      if (inMemory) {
        notesToRender = inMemory;
      }
    } else {
      this.activeNotes.set(leafId, notes);
    }

    const existingElements = Array.from(overlayEl.querySelectorAll(".concrete-sticky-note"));
    const existingMap = new Map<string, HTMLElement>();
    for (const rawEl of existingElements) {
      const el = rawEl as HTMLElement;
      const id = el.dataset.noteId;
      if (id) existingMap.set(id, el);
    }

    for (const note of notesToRender.values()) {
      let noteEl = existingMap.get(note.id);
      if (!noteEl) {
        noteEl = this.createNoteDOM(leafId, view, note, resolvedDefaults, overlayEl);
        overlayEl.appendChild(noteEl);
      } else {
        this.updateNoteDOM(noteEl, note, resolvedDefaults);
      }

      if (!note.placed && !this.placingNotes.has(note.id)) {
        this.startPlacingNote(leafId, view, note, noteEl, overlayEl);
      }

      existingMap.delete(note.id);
    }

    for (const el of existingMap.values()) {
      el.remove();
    }
  }

  private createNoteDOM(
    leafId: string,
    view: MarkdownView,
    note: StickyNoteData,
    defaults: NoteDefaults,
    overlayEl: HTMLElement
  ): HTMLElement {
    const noteEl = activeDocument.createElement("div");
    noteEl.className = "concrete-sticky-note";
    noteEl.dataset.noteId = note.id;
    setStyle(noteEl, "position", "absolute");
    setStyle(noteEl, "pointer-events", "auto");

    // Apply resolved style defaults
    if (defaults.noteColour) {
      noteEl.style.setProperty("background-color", defaults.noteColour);
      noteEl.style.removeProperty("border-color");
    }
    if (defaults.textColour) {
      noteEl.style.setProperty("color", defaults.textColour);
    }
    if (defaults.textSize) {
      const fs = defaults.textSize.endsWith("px") ? defaults.textSize : `${defaults.textSize}px`;
      noteEl.style.setProperty("font-size", fs);
    }

    noteEl.style.setProperty("left", `${note.x}px`);
    noteEl.style.setProperty("top", `${note.y}px`);
    noteEl.style.setProperty("width", `${note.w}px`);
    noteEl.style.setProperty("height", `${note.h}px`);

    // Note name body (centered text)
    const bodyEl = activeDocument.createElement("div");
    bodyEl.className = "concrete-note-body";
    bodyEl.textContent = note.name;
    setStyle(bodyEl, "display", "flex");
    setStyle(bodyEl, "align-items", "center");
    setStyle(bodyEl, "justify-content", "center");
    setStyle(bodyEl, "width", "100%");
    setStyle(bodyEl, "height", "100%");
    setStyle(bodyEl, "text-align", "center");
    setStyle(bodyEl, "padding", "8px");
    setStyle(bodyEl, "font-weight", "500");
    setStyle(bodyEl, "word-break", "break-word");
    setStyle(bodyEl, "overflow", "hidden");
    setStyle(bodyEl, "user-select", "none");
    noteEl.appendChild(bodyEl);

    // Small delete button in top-right
    const deleteBtn = activeDocument.createElement("button");
    deleteBtn.className = "concrete-note-btn concrete-delete-btn";
    setSvgContent(deleteBtn, ICON_DELETE_SVG);
    deleteBtn.title = "Delete note";
    setStyle(deleteBtn, "position", "absolute");
    setStyle(deleteBtn, "top", "4px");
    setStyle(deleteBtn, "right", "4px");
    setStyle(deleteBtn, "opacity", "0");
    setStyle(deleteBtn, "transition", "opacity 0.15s ease");
    noteEl.appendChild(deleteBtn);

    // Show delete button on note hover
    noteEl.addEventListener("mouseenter", () => {
      if (note.placed) setStyle(deleteBtn, "opacity", "0.6");
    });
    noteEl.addEventListener("mouseleave", () => {
      setStyle(deleteBtn, "opacity", "0");
    });
    deleteBtn.addEventListener("mouseenter", () => {
      setStyle(deleteBtn, "opacity", "1");
    });
    deleteBtn.addEventListener("mouseleave", () => {
      if (note.placed) setStyle(deleteBtn, "opacity", "0.6");
    });

    // Stop propagation on mousedown/click for delete button
    deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      const currentNotes = this.activeNotes.get(leafId);
      if (!currentNotes) return;
      currentNotes.delete(note.id);
      noteEl.remove();
      this.saveNotes(view, currentNotes);
    };

    // Double-click to rename note
    noteEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (!note.placed) return; // Don't rename while placing
      new RenameStickyNoteModal(this.plugin.app, note.name, (newName) => {
        const cleanName = newName.trim();
        if (cleanName && cleanName !== note.name) {
          const currentNotes = this.activeNotes.get(leafId);
          if (currentNotes) {
            currentNotes.delete(note.id);
            const updatedNote = { ...note, id: cleanName, name: cleanName };
            currentNotes.set(cleanName, updatedNote);
            this.saveNotes(view, currentNotes);
          }
        }
      }).open();
    });

    // Drag position implementation
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let noteStartX = 0;
    let noteStartY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (!note.placed) return; // Don't drag while placing
      if (e.target === deleteBtn || deleteBtn.contains(e.target as Node)) return;

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      noteStartX = parseFloat(noteEl.style.left) || 0;
      noteStartY = parseFloat(noteEl.style.top) || 0;

      setStyle(noteEl, "z-index", "100");

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - dragStartX;
        const dy = moveEvent.clientY - dragStartY;
        noteEl.style.setProperty("left", `${noteStartX + dx}px`);
        noteEl.style.setProperty("top", `${noteStartY + dy}px`);
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        setStyle(noteEl, "z-index", "10");

        activeDocument.removeEventListener("mousemove", onMouseMove);
        activeDocument.removeEventListener("mouseup", onMouseUp);

        const currentNotes = this.activeNotes.get(leafId);
        const data = currentNotes?.get(note.id);
        if (data) {
          data.x = Math.round(parseFloat(noteEl.style.left) || 0);
          data.y = Math.round(parseFloat(noteEl.style.top) || 0);
          this.saveNotes(view, currentNotes!);
        }
      };

      activeDocument.addEventListener("mousemove", onMouseMove);
      activeDocument.addEventListener("mouseup", onMouseUp);
    };

    noteEl.addEventListener("mousedown", onMouseDown);

    return noteEl;
  }

  private updateNoteDOM(noteEl: HTMLElement, note: StickyNoteData, defaults: NoteDefaults) {
    const bodyEl = noteEl.querySelector(".concrete-note-body") as HTMLElement;
    if (bodyEl) {
      bodyEl.textContent = note.name;
    }

    // Don't reset position while placement mode is tracking the cursor
    if (!this.placingNotes.has(note.id)) {
      noteEl.style.setProperty("left", `${note.x}px`);
      noteEl.style.setProperty("top", `${note.y}px`);
    }
    noteEl.style.setProperty("width", `${note.w}px`);
    noteEl.style.setProperty("height", `${note.h}px`);

    // Apply styles or fallbacks
    if (defaults.noteColour) {
      noteEl.style.setProperty("background-color", defaults.noteColour);
      noteEl.style.removeProperty("border-color");
    } else {
      noteEl.style.removeProperty("background-color");
    }

    if (defaults.textColour) {
      noteEl.style.setProperty("color", defaults.textColour);
    } else {
      noteEl.style.removeProperty("color");
    }

    if (defaults.textSize) {
      const fs = defaults.textSize.endsWith("px") ? defaults.textSize : `${defaults.textSize}px`;
      noteEl.style.setProperty("font-size", fs);
    } else {
      noteEl.style.removeProperty("font-size");
    }
  }

  private startPlacingNote(
    leafId: string,
    view: MarkdownView,
    note: StickyNoteData,
    noteEl: HTMLElement,
    overlayEl: HTMLElement
  ) {
    this.placingNotes.add(note.id);
    setStyle(noteEl, "pointer-events", "none");

    const onMouseMove = (e: MouseEvent) => {
      const rect = overlayEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      noteEl.style.setProperty("left", `${clickX - note.w / 2}px`);
      noteEl.style.setProperty("top", `${clickY - note.h / 2}px`);
    };

    const cleanup = () => {
      activeDocument.removeEventListener("mousemove", onMouseMove);
      activeDocument.removeEventListener("click", onMouseClick, true);
      this.placingNotes.delete(note.id);
      this.placementCleanups.delete(note.id);
    };

    const onMouseClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = overlayEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      cleanup();
      setStyle(noteEl, "pointer-events", "auto");

      const currentNotes = this.activeNotes.get(leafId);
      if (currentNotes) {
        const data = currentNotes.get(note.id);
        if (data) {
          data.x = Math.round(clickX - note.w / 2);
          data.y = Math.round(clickY - note.h / 2);
          data.placed = true;
          this.saveNotes(view, currentNotes);
        }
      }
    };

    this.placementCleanups.set(note.id, cleanup);

    // Initial position matching context click
    const rect = overlayEl.getBoundingClientRect();
    const initX = this.lastContextClick.x - rect.left;
    const initY = this.lastContextClick.y - rect.top;
    noteEl.style.setProperty("left", `${initX - note.w / 2}px`);
    noteEl.style.setProperty("top", `${initY - note.h / 2}px`);

    activeDocument.addEventListener("mousemove", onMouseMove);
    activeDocument.addEventListener("click", onMouseClick, true);
  }

  public async addNoteFromUI(view: MarkdownView, name: string, sizeStr: string) {
    const leafId = ((view.leaf as unknown) as IdentifiableLeaf).id;
    const currentNotes = this.activeNotes.get(leafId) || new Map<string, StickyNoteData>();

    let defaultW = 200;
    let defaultH = 150;
    if (sizeStr) {
      const parts = sizeStr.split("x");
      if (parts.length === 2) {
        defaultW = parseInt(parts[0] || "200") || 200;
        defaultH = parseInt(parts[1] || "150") || 150;
      } else {
        const parts2 = sizeStr.split(",");
        if (parts2.length === 2) {
          defaultW = parseInt(parts2[0] || "200") || 200;
          defaultH = parseInt(parts2[1] || "150") || 150;
        } else {
          const val = parseInt(sizeStr) || 200;
          defaultW = val;
          defaultH = val;
        }
      }
    }

    const newNote: StickyNoteData = {
      id: name,
      name,
      w: defaultW,
      h: defaultH,
      x: 0,
      y: 0,
      placed: false
    };

    currentNotes.set(name, newNote);
    this.activeNotes.set(leafId, currentNotes);
    this.saveNotes(view, currentNotes);
  }

  public async spawnNote(view: MarkdownView, x: number, y: number) {
    const { defaults } = await parseNotesFromView(this.plugin.app, view, this.plugin.settings.globalVars);
    const defaultSize = defaults.noteSize || this.plugin.settings.defaultNoteSize || "200x150";

    new CreateStickyNoteModal(this.plugin.app, defaultSize, (name, size) => {
      void this.addNoteFromUI(view, name, size);
    }).open();
  }

  private saveNotes(view: MarkdownView, notes: Map<string, StickyNoteData>) {
    const leafId = ((view.leaf as unknown) as IdentifiableLeaf).id;
    this.pendingSaveLeaves.add(leafId);

    if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      void (async () => {
        const file = view.file;
        if (!file) {
          this.pendingSaveLeaves.delete(leafId);
          return;
        }
        
        try {
          const currentContent = view.editor ? view.editor.getValue() : await this.plugin.app.vault.read(file);
          const newContent = updateNotesInDocument(currentContent, notes);
          
          if (view.editor) {
            if (currentContent !== newContent) {
              const cursor = view.editor.getCursor();
              const scrollInfo = view.editor.getScrollInfo();
              view.editor.setValue(newContent);
              view.editor.setCursor(cursor);
              view.editor.scrollTo(0, scrollInfo.top);
            }
          } else {
            await this.plugin.app.vault.modify(file, newContent);
          }
        } catch (err) {
          console.error("Failed to save sticky notes:", err);
        } finally {
          this.pendingSaveLeaves.delete(leafId);
        }
      })();
    }, 300);
  }

  public destroyAll() {
    if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
    for (const cleanup of this.placementCleanups.values()) {
      cleanup();
    }
    this.placementCleanups.clear();
    for (const el of this.activeOverlays.values()) {
      el.remove();
    }
    this.activeOverlays.clear();
    this.activeNotes.clear();
    this.pendingSaveLeaves.clear();
  }
}

function setStyle(el: HTMLElement, name: string, value: string): void {
  el.style.setProperty(name, value);
}
