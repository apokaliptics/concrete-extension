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

// Inline modern SVG icon constants
const ICON_LOCK = `<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`;
const ICON_UNLOCK = `<svg viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H18v-2c0-3.31-2.69-6-6-6S6 2.69 6 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const ICON_ROTATE = `<svg viewBox="0 0 24 24"><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>`;
const ICON_RESIZE = `<svg viewBox="0 0 10 10"><path d="M10 0 L0 10 M10 3 L3 10 M10 6 L6 10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;

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
          const w = parseFloat(parts[2] || "120");
          const h = parseFloat(parts[3] || "80");
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
  private pendingSaveLeaves = new Set<string>();
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
        this.pendingSaveLeaves.delete(leafId);
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
    
    // Resolve merged settings and document defaults
    const resolvedDefaults: NoteDefaults = {
      textSize: defaults.textSize || this.plugin.settings.defaultNoteTextSize || "14px",
      textColour: defaults.textColour || this.plugin.settings.defaultNoteTextColour || "",
      noteSize: defaults.noteSize || this.plugin.settings.defaultNoteSize || "200x150",
      noteColour: defaults.noteColour || this.plugin.settings.defaultNoteColour || ""
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
    noteEl.style.setProperty("transform", `rotate(${note.r}deg)`);

    const headerEl = document.createElement("div");
    headerEl.className = "concrete-note-header";

    const lockBtn = document.createElement("button");
    lockBtn.className = "concrete-note-btn concrete-lock-btn";
    // eslint-disable-next-line @microsoft/sdl/no-inner-html
    lockBtn.innerHTML = note.locked ? ICON_LOCK : ICON_UNLOCK;
    lockBtn.title = note.locked ? "Unlock note" : "Lock note";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "concrete-note-btn concrete-delete-btn";
    // eslint-disable-next-line @microsoft/sdl/no-inner-html
    deleteBtn.innerHTML = ICON_DELETE;
    deleteBtn.title = "Delete note";

    const rotateHandle = document.createElement("div");
    rotateHandle.className = "concrete-note-rotate-handle";
    // eslint-disable-next-line @microsoft/sdl/no-inner-html
    rotateHandle.innerHTML = ICON_ROTATE;
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

    // Dedicated resize handle
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "concrete-note-resize-handle";
    // eslint-disable-next-line @microsoft/sdl/no-inner-html
    resizeHandle.innerHTML = ICON_RESIZE;
    noteEl.appendChild(resizeHandle);

    // Stop propagation on mousedown so header/note dragging is not triggered
    lockBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    rotateHandle.addEventListener("mousedown", (e) => e.stopPropagation());
    resizeHandle.addEventListener("mousedown", (e) => e.stopPropagation());

    lockBtn.onclick = (e) => {
      e.stopPropagation();
      const currentNotes = this.activeNotes.get(leafId);
      if (!currentNotes) return;
      const data = currentNotes.get(note.id);
      if (data) {
        data.locked = !data.locked;
        // eslint-disable-next-line @microsoft/sdl/no-inner-html
        lockBtn.innerHTML = data.locked ? ICON_LOCK : ICON_UNLOCK;
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

    // Drag-to-resize handle implementation
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartW = 0;
    let resizeStartH = 0;

    resizeHandle.onmousedown = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const currentNotes = this.activeNotes.get(leafId);
      const data = currentNotes?.get(note.id);
      if (data?.locked) return;

      isResizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartW = noteEl.clientWidth;
      resizeStartH = noteEl.clientHeight;

      const onResizeMove = (moveEvent: MouseEvent) => {
        if (!isResizing) return;
        const dw = moveEvent.clientX - resizeStartX;
        const dh = moveEvent.clientY - resizeStartY;
        
        const newW = Math.max(120, resizeStartW + dw);
        const newH = Math.max(80, resizeStartH + dh);
        
        noteEl.style.setProperty("width", `${newW}px`);
        noteEl.style.setProperty("height", `${newH}px`);
      };

      const onResizeUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener("mousemove", onResizeMove);
        document.removeEventListener("mouseup", onResizeUp);

        const currentNotes = this.activeNotes.get(leafId);
        const data = currentNotes?.get(note.id);
        if (data) {
          data.w = noteEl.clientWidth;
          data.h = noteEl.clientHeight;
          this.saveNotes(view, currentNotes!);
        }
      };

      document.addEventListener("mousemove", onResizeMove);
      document.addEventListener("mouseup", onResizeUp);
    };

    // Drag position implementation
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
      if (e.target === lockBtn || e.target === deleteBtn || e.target === rotateHandle || e.target === resizeHandle) return;

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
      if (e.target !== contentEl && e.target !== resizeHandle) {
        onMouseDown(e);
      }
    });

    // Rotation implementation
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
        if (!isRotating) return;
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
      // eslint-disable-next-line @microsoft/sdl/no-inner-html
      lockBtn.innerHTML = note.locked ? ICON_LOCK : ICON_UNLOCK;
      lockBtn.title = note.locked ? "Unlock note" : "Lock note";
    }
    contentEl.contentEditable = note.locked ? "false" : "true";

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

  public async spawnNote(view: MarkdownView, x: number, y: number) {
    const leafId = ((view.leaf as unknown) as IdentifiableLeaf).id;
    const currentNotes = this.activeNotes.get(leafId) || new Map<string, StickyNoteData>();
    const id = Date.now().toString();

    const { defaults } = await parseNotesFromView(this.plugin.app, view, this.plugin.settings.globalVars);
    
    // Resolve merged settings and document defaults
    const sizeStr = defaults.noteSize || this.plugin.settings.defaultNoteSize || "200x150";
    let defaultW = 200;
    let defaultH = 150;
    if (sizeStr) {
      const parts = sizeStr.split("x");
      if (parts.length === 2) {
        defaultW = parseInt(parts[0] || "200") || 200;
        defaultH = parseInt(parts[1] || "150") || 150;
      } else {
        const val = parseInt(sizeStr) || 200;
        defaultW = val;
        defaultH = val;
      }
    }

    const resolvedDefaults: NoteDefaults = {
      textSize: defaults.textSize || this.plugin.settings.defaultNoteTextSize || "14px",
      textColour: defaults.textColour || this.plugin.settings.defaultNoteTextColour || "",
      noteSize: sizeStr,
      noteColour: defaults.noteColour || this.plugin.settings.defaultNoteColour || ""
    };

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
      const noteEl = this.createNoteDOM(leafId, view, newNote, resolvedDefaults, overlayEl);
      overlayEl.appendChild(noteEl);
      const contentEl = noteEl.querySelector(".concrete-note-content") as HTMLElement;
      contentEl?.focus();
    }

    this.saveNotes(view, currentNotes);
  }

  private saveNotes(view: MarkdownView, notes: Map<string, StickyNoteData>) {
    const leafId = ((view.leaf as unknown) as IdentifiableLeaf).id;
    this.pendingSaveLeaves.add(leafId);

    if (this.saveTimeout) activeWindow.clearTimeout(this.saveTimeout);
    this.saveTimeout = activeWindow.setTimeout(async () => {
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
        // Force a final reconcile check now that files are cleanly written
        void this.reconcile();
      }
    }, 300); // 300ms responsive debounce
  }

  public destroyAll() {
    if (this.saveTimeout) activeWindow.clearTimeout(this.saveTimeout);
    for (const el of this.activeOverlays.values()) {
      el.remove();
    }
    this.activeOverlays.clear();
    this.activeNotes.clear();
    this.pendingSaveLeaves.clear();
  }
}
