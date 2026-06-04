/* eslint-disable obsidianmd/no-static-styles-assignment */
import { App, MarkdownView } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { parseDeclarations } from "../reactive/engine";
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
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  locked: boolean;
  content: string;
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
    if (key && !key.startsWith("note_")) {
      defaults.set(key, val);
    }
  }

  const outputLines = ["#notes"];
  for (const [key, val] of defaults) {
    outputLines.push(`${key} = ${val}`);
  }
  for (const note of notes.values()) {
    const encodedContent = encodeURIComponent(note.content);
    outputLines.push(`note_${note.id} = ${Math.round(note.x)},${Math.round(note.y)},${Math.round(note.w)},${Math.round(note.h)},${Math.round(note.r)},${note.locked},${encodedContent}`);
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
    } else if (blockStartIdx !== -1 && line.toLowerCase().startsWith("#notes")) {
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
      else if (key.startsWith("note_")) {
        const id = key.substring(5);
        const parts = lastStyle.val.split(",");
        if (parts.length >= 7) {
          const x = parseFloat(parts[0] || "0");
          const y = parseFloat(parts[1] || "0");
          const w = parseFloat(parts[2] || "100");
          const h = parseFloat(parts[3] || "100");
          const r = parseFloat(parts[4] || "0");
          const locked = parts[5] === "true";
          const contentStr = decodeURIComponent(parts.slice(6).join(",") || "");
          notes.set(id, { id, x, y, w, h, r, locked, content: contentStr });
        }
      }
    }
  }

  return { notes, defaults };
}

export class SpatialOverlayManager {
  private activeOverlays = new Map<string, HTMLElement>();
  private activeNotes = new Map<string, Map<string, StickyNoteData>>();
  private saveTimeout: number | null = null;
  public lastContextClick = { x: 100, y: 100 };

  constructor(private plugin: ReactiveVariablesPlugin) {
    this.plugin.registerDomEvent(activeWindow, "contextmenu", (e: MouseEvent) => {
      this.lastContextClick = { x: e.clientX, y: e.clientY };
    });
  }

  getOverlayElement(leafId: string): HTMLElement | undefined {
    return this.activeOverlays.get(leafId);
  }

  async reconcile() {
    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
    const activeLeafIds = new Set<string>();

    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      const leafId = ((leaf as unknown) as IdentifiableLeaf).id;
      activeLeafIds.add(leafId);

      await this.ensureOverlay(leafId, view);
    }

    for (const [leafId, el] of this.activeOverlays) {
      if (!activeLeafIds.has(leafId)) {
        el.remove();
        this.activeOverlays.delete(leafId);
        this.activeNotes.delete(leafId);
      }
    }
  }

  private async ensureOverlay(leafId: string, view: MarkdownView) {
    let overlayEl = this.activeOverlays.get(leafId);
    if (!overlayEl || !overlayEl.isConnected) {
      overlayEl = document.createElement("div");
      overlayEl.className = "concrete-spatial-overlay";
      overlayEl.style.setProperty("position", "absolute");
      overlayEl.style.setProperty("top", "0");
      overlayEl.style.setProperty("left", "0");
      overlayEl.style.setProperty("width", "100%");
      overlayEl.style.setProperty("height", "100%");
      overlayEl.style.setProperty("pointer-events", "none");
      overlayEl.style.setProperty("z-index", "5");

      const container = view.contentEl;
      container.style.setProperty("position", "relative");
      container.appendChild(overlayEl);
      this.activeOverlays.set(leafId, overlayEl);
    }

    await this.renderNotes(leafId, view, overlayEl);
  }

  private async renderNotes(leafId: string, view: MarkdownView, overlayEl: HTMLElement) {
    const { notes, defaults } = await parseNotesFromView(this.plugin.app, view, this.plugin.settings.globalVars);
    this.activeNotes.set(leafId, notes);

    const existingElements = Array.from(overlayEl.querySelectorAll(".concrete-sticky-note"));
    const existingMap = new Map<string, HTMLElement>();
    for (const rawEl of existingElements) {
      const el = rawEl as HTMLElement;
      const id = el.dataset.noteId;
      if (id) existingMap.set(id, el);
    }

    for (const note of notes.values()) {
      let noteEl = existingMap.get(note.id);
      if (!noteEl) {
        noteEl = this.createNoteDOM(leafId, view, note, defaults, overlayEl);
        overlayEl.appendChild(noteEl);
      } else {
        this.updateNoteDOM(noteEl, note, defaults);
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
    const noteEl = document.createElement("div");
    noteEl.className = "concrete-sticky-note";
    noteEl.dataset.noteId = note.id;
    noteEl.style.setProperty("position", "absolute");
    noteEl.style.setProperty("pointer-events", "auto");

    const bgColour = defaults.noteColour || "#fffae6";
    const textColour = defaults.textColour || "var(--text-normal)";
    const fontSize = defaults.textSize ? (defaults.textSize.endsWith("px") ? defaults.textSize : `${defaults.textSize}px`) : "14px";

    noteEl.style.setProperty("background-color", bgColour);
    noteEl.style.setProperty("color", textColour);
    noteEl.style.setProperty("font-size", fontSize);

    noteEl.style.setProperty("left", `${note.x}px`);
    noteEl.style.setProperty("top", `${note.y}px`);
    noteEl.style.setProperty("width", `${note.w}px`);
    noteEl.style.setProperty("height", `${note.h}px`);
    noteEl.style.setProperty("transform", `rotate(${note.r}deg)`);

    const headerEl = document.createElement("div");
    headerEl.className = "concrete-note-header";

    const lockBtn = document.createElement("button");
    lockBtn.className = "concrete-note-btn concrete-lock-btn";
    lockBtn.textContent = note.locked ? "🔒" : "🔓";
    lockBtn.title = note.locked ? "Unlock note" : "Lock note";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "concrete-note-btn concrete-delete-btn";
    deleteBtn.textContent = "❌";
    deleteBtn.title = "Delete note";

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "concrete-note-rotate-handle";
    rotateHandle.textContent = "🔄";
    rotateHandle.title = "Drag to rotate";

    headerEl.appendChild(lockBtn);
    headerEl.appendChild(rotateHandle);
    headerEl.appendChild(deleteBtn);
    noteEl.appendChild(headerEl);

    const contentEl = document.createElement("div");
    contentEl.className = "concrete-note-content";
    contentEl.contentEditable = note.locked ? "false" : "true";
    // eslint-disable-next-line @microsoft/sdl/no-inner-html
    contentEl.innerHTML = note.content;
    noteEl.appendChild(contentEl);

    lockBtn.onclick = (e) => {
      e.stopPropagation();
      const currentNotes = this.activeNotes.get(leafId);
      if (!currentNotes) return;
      const data = currentNotes.get(note.id);
      if (data) {
        data.locked = !data.locked;
        lockBtn.textContent = data.locked ? "🔒" : "🔓";
        lockBtn.title = data.locked ? "Unlock note" : "Lock note";
        contentEl.contentEditable = data.locked ? "false" : "true";
        this.saveNotes(view, currentNotes);
      }
    };

    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      const currentNotes = this.activeNotes.get(leafId);
      if (!currentNotes) return;
      currentNotes.delete(note.id);
      noteEl.remove();
      this.saveNotes(view, currentNotes);
    };

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let noteStartX = 0;
    let noteStartY = 0;

    const onMouseDown = (e: MouseEvent) => {
      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data?.locked) return;

      if (e.target === contentEl) return;
      if (e.target === lockBtn || e.target === deleteBtn || e.target === rotateHandle) return;

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      noteStartX = parseFloat(noteEl.style.left) || 0;
      noteStartY = parseFloat(noteEl.style.top) || 0;

      noteEl.style.setProperty("z-index", "100");

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      noteEl.style.setProperty("left", `${noteStartX + dx}px`);
      noteEl.style.setProperty("top", `${noteStartY + dy}px`);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      noteEl.style.setProperty("z-index", "10");

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data) {
        data.x = parseFloat(noteEl.style.left) || 0;
        data.y = parseFloat(noteEl.style.top) || 0;
        this.saveNotes(view, currentNotes!);
      }
    };

    headerEl.addEventListener("mousedown", onMouseDown);
    noteEl.addEventListener("mousedown", (e) => {
      overlayEl.appendChild(noteEl);
      if (e.target !== contentEl) {
        onMouseDown(e);
      }
    });

    let isRotating = false;

    rotateHandle.onmousedown = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data?.locked) return;

      isRotating = true;
      const rect = noteEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const onRotateMove = (moveEvent: MouseEvent) => {
        if (!isRotating) return;
        const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
        const deg = angle * (180 / Math.PI) - 45;
        noteEl.style.setProperty("transform", `rotate(${deg}deg)`);
      };

      const onRotateUp = () => {
        isRotating = false;
        document.removeEventListener("mousemove", onRotateMove);
        document.removeEventListener("mouseup", onRotateUp);

        const currentNotes = this.activeNotes.get(leafId);
        const data = currentNotes?.get(note.id);
        if (data) {
          const transform = noteEl.style.transform;
          const match = /rotate\(([-\d.]+)deg\)/.exec(transform);
          if (match) {
            data.r = parseFloat(match[1] || "0");
          }
          this.saveNotes(view, currentNotes!);
        }
      };

      document.addEventListener("mousemove", onRotateMove);
      document.addEventListener("mouseup", onRotateUp);
    };

    noteEl.addEventListener("mouseup", () => {
      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data && !data.locked) {
        const w = noteEl.clientWidth;
        const h = noteEl.clientHeight;
        if (w !== data.w || h !== data.h) {
          data.w = w;
          data.h = h;
          this.saveNotes(view, currentNotes!);
        }
      }
    });

    contentEl.onblur = () => {
      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data && !data.locked) {
        data.content = contentEl.innerHTML;
        this.saveNotes(view, currentNotes!);
      }
    };

    return noteEl;
  }

  private updateNoteDOM(noteEl: HTMLElement, note: StickyNoteData, defaults: NoteDefaults) {
    const contentEl = noteEl.querySelector(".concrete-note-content") as HTMLElement;
    const isFocused = document.activeElement === contentEl;
    if (!isFocused) {
      // eslint-disable-next-line @microsoft/sdl/no-inner-html
      contentEl.innerHTML = note.content;
    }

    noteEl.style.setProperty("left", `${note.x}px`);
    noteEl.style.setProperty("top", `${note.y}px`);
    noteEl.style.setProperty("width", `${note.w}px`);
    noteEl.style.setProperty("height", `${note.h}px`);
    noteEl.style.setProperty("transform", `rotate(${note.r}deg)`);

    const lockBtn = noteEl.querySelector(".concrete-lock-btn") as HTMLElement;
    if (lockBtn) {
      lockBtn.textContent = note.locked ? "🔒" : "🔓";
      lockBtn.title = note.locked ? "Unlock note" : "Lock note";
    }
    contentEl.contentEditable = note.locked ? "false" : "true";

    const bgColour = defaults.noteColour || "#fffae6";
    const textColour = defaults.textColour || "var(--text-normal)";
    const fontSize = defaults.textSize ? (defaults.textSize.endsWith("px") ? defaults.textSize : `${defaults.textSize}px`) : "14px";

    noteEl.style.setProperty("background-color", bgColour);
    noteEl.style.setProperty("color", textColour);
    noteEl.style.setProperty("font-size", fontSize);
  }

  public async spawnNote(view: MarkdownView, x: number, y: number) {
    const leafId = ((view.leaf as unknown) as IdentifiableLeaf).id;
    const currentNotes = this.activeNotes.get(leafId) || new Map<string, StickyNoteData>();
    const id = Date.now().toString();

    const { defaults } = await parseNotesFromView(this.plugin.app, view, this.plugin.settings.globalVars);
    let defaultW = 100;
    let defaultH = 100;
    if (defaults.noteSize) {
      const parts = defaults.noteSize.split("x");
      if (parts.length === 2) {
        defaultW = parseInt(parts[0] || "100") || 100;
        defaultH = parseInt(parts[1] || "100") || 100;
      }
    }

    const newNote: StickyNoteData = {
      id,
      x,
      y,
      w: defaultW,
      h: defaultH,
      r: 0,
      locked: false,
      content: "Double click to edit"
    };

    currentNotes.set(id, newNote);
    this.activeNotes.set(leafId, currentNotes);

    const overlayEl = this.activeOverlays.get(leafId);
    if (overlayEl) {
      const noteEl = this.createNoteDOM(leafId, view, newNote, defaults, overlayEl);
      overlayEl.appendChild(noteEl);
      const contentEl = noteEl.querySelector(".concrete-note-content") as HTMLElement;
      contentEl?.focus();
    }

    this.saveNotes(view, currentNotes);
  }

  private saveNotes(view: MarkdownView, notes: Map<string, StickyNoteData>) {
    if (this.saveTimeout) activeWindow.clearTimeout(this.saveTimeout);
    this.saveTimeout = activeWindow.setTimeout(async () => {
      const file = view.file;
      if (!file) return;
      
      const currentContent = view.editor ? view.editor.getValue() : await this.plugin.app.vault.read(file);
      const newContent = updateNotesInDocument(currentContent, notes);
      
      if (view.editor) {
        const cursor = view.editor.getCursor();
        const scrollInfo = view.editor.getScrollInfo();
        view.editor.setValue(newContent);
        view.editor.setCursor(cursor);
        view.editor.scrollTo(0, scrollInfo.top);
      } else {
        await this.plugin.app.vault.modify(file, newContent);
      }
    }, 1000);
  }

  public destroyAll() {
    if (this.saveTimeout) activeWindow.clearTimeout(this.saveTimeout);
    for (const el of this.activeOverlays.values()) {
      el.remove();
    }
    this.activeOverlays.clear();
    this.activeNotes.clear();
  }
}
