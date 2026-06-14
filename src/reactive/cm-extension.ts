import {
  EditorState,
  Extension,
  StateEffect,
  StateField,
  Facet,
  Text
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  DeclBlockRange,
  isColorString,
  RuleEntry,
  parseDeclarations,
  findWrapperMatchesInText,
  containsImageMarkdown
} from "./engine";
import {
  applyCssVarsToElement,
  getEnabledStyles,
  getTextSizeCssVar,
  hasEnabledStyles
} from "./utils";
import type { ReactiveFeatureOptions } from "./utils";

const CODE_NODE_NAMES = new Set(["FencedCode", "CodeBlock", "InlineCode"]);

interface VarState {
  rules: Map<string, RuleEntry>;
  blocks: DeclBlockRange[];
  version: number;
}

interface ReparsePayload {
  rules: Map<string, RuleEntry>;
  blocks: DeclBlockRange[];
}

const reparseEffect = StateEffect.define<ReparsePayload>();
const toggleFoldEffect = StateEffect.define<number>(); // line number

const optionsFacet = Facet.define<ReactiveFeatureOptions, ReactiveFeatureOptions>({
  combine: values => values[values.length - 1] || { enableBulletPoints: true, enableColorVariables: true, enableTextVariables: true, globalVars: "" }
});

const varStateField = StateField.define<VarState>({
  create(state) {
    const options = state.facet(optionsFacet);
    const { rules, blocks } = parseDeclarations(state.doc, options?.globalVars);
    return { rules, blocks, version: 1 };
  },
  update(value, tr) {
    let blocks = value.blocks;
    let rules = value.rules;
    let version = value.version;
    if (tr.docChanged) {
      blocks = blocks.map((b) => ({
        ...b,
        from: tr.changes.mapPos(b.from, -1),
        to: tr.changes.mapPos(b.to, 1)
      }));
      version += 1;
    }
    for (const effect of tr.effects) {
      if (effect.is(reparseEffect)) {
        rules = effect.value.rules;
        blocks = effect.value.blocks;
        version += 1;
      }
    }
    return { rules, blocks, version };
  }
});

const foldedSetField = StateField.define<Set<number>>({
  create() { return new Set(); },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(toggleFoldEffect)) {
        const next = new Set(value);
        if (next.has(e.value)) next.delete(e.value);
        else next.add(e.value);
        return next;
      }
    }
    return value;
  }
});

export function reactiveVariablesExtension(options: ReactiveFeatureOptions): Extension {
  return [
    optionsFacet.of(options),
    varStateField,
    foldedSetField,
    createDecorationPlugin(options),
    createCssVarPlugin(options),
    debouncedReparsePlugin,
    colorAutocompletePlugin
  ];
}

function createDecorationPlugin(options: ReactiveFeatureOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = buildDecorations(view, options); }
      update(update: ViewUpdate) {
        if (
          update.docChanged || update.selectionSet || update.viewportChanged ||
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(reparseEffect) || e.is(toggleFoldEffect))
          )
        ) {
          this.decorations = buildDecorations(update.view, options);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

function createCssVarPlugin(options: ReactiveFeatureOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      private lastKeys: string[] = [];
      private lastVersion = -1;
      constructor(private view: EditorView) { this.apply(view.state); }
      update(update: ViewUpdate) {
        const vs = update.state.field(varStateField);
        if (vs.version !== this.lastVersion) this.apply(update.state);
      }
      private apply(state: EditorState) {
        const vs = state.field(varStateField);
        const c = this.view.dom.closest(".markdown-source-view") ?? this.view.dom;
        if (!c) return;
        this.lastKeys = applyCssVarsToElement(c as HTMLElement, vs.rules, this.lastKeys, options);
        this.lastVersion = vs.version;
      }
    }
  );
}

const debouncedReparsePlugin = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;
    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      const vs = update.startState.field(varStateField);
      if (!shouldReparse(update, vs.blocks)) return;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const options = update.state.facet(optionsFacet);
        const { rules, blocks } = parseDeclarations(update.state.doc, options?.globalVars);
        update.view.dispatch({ effects: reparseEffect.of({ rules, blocks }) });
      }, 200);
    }
    destroy() { if (this.timer) window.clearTimeout(this.timer); }
  }
);

/* ── Widgets ── */

class ColorSwatchWidget extends WidgetType {
  constructor(public color: string, public from: number, public to: number) { super(); }
  eq(other: ColorSwatchWidget) { return other.color === this.color && other.from === this.from && other.to === this.to; }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const w = createSpan();
    w.className = "rv-color-picker-wrapper";
    const input = createEl("input");
    input.type = "color";
    let hex = this.color;
    if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    input.value = hex;
    input.className = "rv-color-picker";
    const stop = (e: Event) => e.stopPropagation();
    input.onmousedown = stop;
    input.onclick = stop;
    input.onchange = () => { view.dispatch({ changes: { from: this.from, to: this.to, insert: input.value } }); };
    w.appendChild(input);
    return w;
  }
}

class FoldToggleWidget extends WidgetType {
  constructor(public summary: string, public lineNum: number, public folded: boolean) { super(); }
  eq(other: FoldToggleWidget) { return other.summary === this.summary && other.lineNum === this.lineNum && other.folded === this.folded; }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const btn = createSpan();
    btn.className = "rv-fold-widget";
    btn.textContent = this.folded ? `▶ ${this.summary}` : "▼";
    const ln = this.lineNum;
    btn.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.setTimeout(() => {
        view.dispatch({ effects: [toggleFoldEffect.of(ln)] });
      }, 0);
    });
    return btn;
  }
}

const BULLET_CHARS = ["•", "◦", "▸", "▹", "⁃", "·"];

class BulletWidget extends WidgetType {
  constructor(public level: number) {
    super();
  }
  eq(other: BulletWidget) {
    return other.level === this.level;
  }
  toDOM() {
    const span = activeDocument.createElement("span");
    span.className = `rv-bullet rv-bullet-${this.level}`;
    span.textContent = BULLET_CHARS[Math.min(this.level - 1, BULLET_CHARS.length - 1)] + " ";
    return span;
  }
}

/* ── Decorations ── */

function buildDecorations(view: EditorView, options: ReactiveFeatureOptions): DecorationSet {
  const varState = view.state.field(varStateField);
  const foldedSet = view.state.field(foldedSetField);
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const decs: Array<{ from: number; to: number; value: Decoration }> = [];

  // Process each vars block for fold UI
  for (const block of varState.blocks) {
    if (block.source !== "vars-block") continue;
    const blockLineNum = view.state.doc.lineAt(block.from).number;
    const isFolded = foldedSet.has(blockLineNum);

    let colors = 0, textStyles = 0;
    for (const rule of varState.rules.values()) {
      for (const style of rule.styles) {
        if (style.valFrom >= block.from && style.valTo <= block.to) {
          if ((style.section === "colors" || isColorString(style.val)) && options.enableColorVariables) colors++;
          else if (style.section === "text" && options.enableTextVariables) textStyles++;
          else if (options.enableColorVariables || options.enableTextVariables) colors++;
        }
      }
    }
    const summary = `[VARS: ${colors} color${colors !== 1 ? "s" : ""}, ${textStyles} style${textStyles !== 1 ? "s" : ""}]`;

    const firstLine = view.state.doc.lineAt(block.from);
    decs.push({
      from: firstLine.to,
      to: firstLine.to,
      value: Decoration.widget({ widget: new FoldToggleWidget(summary, blockLineNum, isFolded), side: 1 })
    });

    if (isFolded) {
      const endLineNum = view.state.doc.lineAt(block.to).number;
      for (let ln = blockLineNum + 1; ln <= endLineNum; ln++) {
        const line = view.state.doc.line(ln);
        decs.push({
          from: line.from,
          to: line.from,
          value: Decoration.line({ class: "rv-vars-hidden" })
        });
      }
    }
  }

  // Color swatches in un-folded blocks
  if (options.enableColorVariables) {
    for (const rule of varState.rules.values()) {
      for (const style of rule.styles) {
        const inFolded = varState.blocks.some(b => {
          if (b.source !== "vars-block") return false;
          const bln = view.state.doc.lineAt(b.from).number;
          return foldedSet.has(bln) && style.valFrom >= b.from && style.valTo <= b.to;
        });
        if (inFolded) continue;

        if (isColorString(style.val) && style.valFrom !== -1) {
          decs.push({ from: style.valFrom, to: style.valTo, value: Decoration.mark({ class: "rv-tag-override" }) });
          decs.push({ from: style.valFrom, to: style.valFrom, value: Decoration.widget({ widget: new ColorSwatchWidget(style.val, style.valFrom, style.valTo), side: -1 }) });
        }
      }
    }
  }

  // Wrapper + list + dash decorations
  const wrappers = Array.from(varState.rules.values()).filter(r => r.type === "wrapper" && hasEnabledStyles(r, options));
  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;
    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      if (isInDeclBlock(line.from, varState.blocks)) continue;

      // 1. Native List Interception
      if (options.enableBulletPoints) {
        const listMatch = /^([ \t]*)([-+])([ \t]+)/.exec(line.text);
        if (listMatch && !containsImageMarkdown(line.text)) {
          const indent = listMatch[1] || "";
          const marker = listMatch[2] || "";
          const space = listMatch[3] || "";
          const level = getListLevel(view.state, line.from + indent.length);

          decs.push({
            from: line.from,
            to: line.from,
            value: Decoration.line({ class: `rv-level rv-level-${Math.min(level, 6)}` })
          });

          if (lineNo !== activeLine) {
            const start = line.from + indent.length;
            const end = start + marker.length + space.length;
            decs.push({
              from: start,
              to: end,
              value: Decoration.replace({
                widget: new BulletWidget(level)
              })
            });
          }
        }
      }

      // 2. Wrapper parsing
      if (lineNo === activeLine || wrappers.length === 0) continue;
      const matches = findWrapperMatchesInText(line.text, line.from, wrappers);
      for (const m of matches) {
        if (isInCodeOrMath(view.state, m.fullFrom)) continue;
        decs.push({ from: m.fullFrom, to: m.contentFrom, value: Decoration.replace({}) });
        let markClass = "rv-styled";
        let markAttrs: Record<string, string> | undefined;
        for (const style of getEnabledStyles(m.rule, options)) {
          if (style.section === "colors" || isColorString(style.val)) {
            if (!markAttrs) markAttrs = {};
            markAttrs.style = (markAttrs.style || "") + `color: ${style.val};`;
          } else {
            markClass += ` rv-${style.val}`;
            const textSizeCssVar = getTextSizeCssVar(style.val, varState.rules, options);
            if (textSizeCssVar) {
              if (!markAttrs) markAttrs = {};
              markAttrs.style = (markAttrs.style || "") + `font-size: var(${textSizeCssVar});`;
            }
          }
        }
        decs.push({ from: m.contentFrom, to: m.contentTo, value: Decoration.mark({ class: markClass, ...(markAttrs ? { attributes: markAttrs } : {}) }) });
        decs.push({ from: m.contentTo, to: m.fullTo, value: Decoration.replace({}) });
      }
    }
  }

  decs.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(decs, true);
}

/* ── Color Autocomplete Pop-up ViewPlugin ── */

const colorAutocompletePlugin = ViewPlugin.fromClass(
  class {
    private popupEl: HTMLDivElement | null = null;
    private activeRange: { from: number; to: number } | null = null;

    constructor(private view: EditorView) {}

    update(update: ViewUpdate) {
      const options = update.state.facet(optionsFacet);
      if (!options.enableColorVariables) {
        this.destroyPopup();
        return;
      }

      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.checkState(options);
      }
    }

    destroy() {
      this.destroyPopup();
    }

    private destroyPopup() {
      if (this.popupEl) {
        this.popupEl.remove();
        this.popupEl = null;
      }
      this.activeRange = null;
    }

    private checkState(options: ReactiveFeatureOptions) {
      const state = this.view.state;
      if (state.selection.ranges.length !== 1) {
        this.destroyPopup();
        return;
      }

      const pos = state.selection.main.head;
      const line = state.doc.lineAt(pos);
      const varState = state.field(varStateField);

      const block = varState.blocks.find(b => pos >= b.from && pos <= b.to);
      if (!block) {
        this.destroyPopup();
        return;
      }

      const section = getCurrentSectionOfLine(state.doc, line.number, block);
      if (!isColorPropertyLine(line.text, section)) {
        this.destroyPopup();
        return;
      }

      const eqIdx = line.text.indexOf("=");
      const hashIdx = line.text.indexOf("#", eqIdx);
      if (hashIdx === -1 || hashIdx < eqIdx) {
        this.destroyPopup();
        return;
      }

      const hashPos = line.from + hashIdx;
      if (pos < hashPos) {
        this.destroyPopup();
        return;
      }

      const afterHash = line.text.substring(hashIdx + 1);
      const hexMatch = /^[a-fA-F0-9]{0,8}/.exec(afterHash);
      const hexVal = hexMatch ? hexMatch[0] : "";
      const valEnd = hashPos + 1 + hexVal.length;

      if (pos > valEnd) {
        this.destroyPopup();
        return;
      }

      this.activeRange = { from: hashPos + 1, to: valEnd };
      this.showPopup(hashPos, hexVal);
    }

    private showPopup(hashPos: number, currentHex: string) {
      if (!this.popupEl) {
        this.popupEl = activeDocument.createElement("div");
        this.popupEl.className = "rv-color-autocomplete-popup";
        
        const colors = [
          "#ef4444", "#f97316", "#f59e0b",
          "#10b981", "#06b6d4", "#3b82f6",
          "#6366f1", "#8b5cf6", "#ec4899"
        ];

        const grid = activeDocument.createElement("div");
        grid.className = "rv-color-autocomplete-grid";
        for (const col of colors) {
          const swatch = activeDocument.createElement("div");
          swatch.className = "rv-color-autocomplete-swatch";
          swatch.style.setProperty("background-color", col);
          swatch.title = col;
          swatch.onclick = (e) => {
            e.stopPropagation();
            this.insertColor(col);
          };
          grid.appendChild(swatch);
        }
        this.popupEl.appendChild(grid);

        const bottomBar = activeDocument.createElement("div");
        bottomBar.className = "rv-color-autocomplete-bottom";
        
        const pickerBtn = activeDocument.createElement("button");
        pickerBtn.className = "rv-color-autocomplete-picker-btn";
        pickerBtn.textContent = "\uD83C\uDF08 custom colour";
        
        const hiddenInput = activeDocument.createElement("input");
        hiddenInput.type = "color";
        setStyle(hiddenInput, "display", "none");
        if (currentHex.length === 6 || currentHex.length === 3) {
          let hex = currentHex;
          if (hex.length === 3) {
            const r = hex.charAt(0);
            const g = hex.charAt(1);
            const b = hex.charAt(2);
            hex = r + r + g + g + b + b;
          }
          hiddenInput.value = "#" + hex;
        } else {
          hiddenInput.value = "#3b82f6";
        }
        
        hiddenInput.onchange = () => {
          this.insertColor(hiddenInput.value);
        };
        hiddenInput.onclick = (e) => e.stopPropagation();

        pickerBtn.onclick = (e) => {
          e.stopPropagation();
          hiddenInput.click();
        };

        bottomBar.appendChild(pickerBtn);
        bottomBar.appendChild(hiddenInput);
        this.popupEl.appendChild(bottomBar);

        const scroller = this.view.dom.closest(".cm-scroller") || this.view.dom;
        scroller.appendChild(this.popupEl);
      }

      const coords = this.view.coordsAtPos(hashPos);
      if (coords) {
        const scroller = this.view.dom.closest(".cm-scroller") || this.view.dom;
        const scrollerRect = scroller.getBoundingClientRect();
        setStyle(this.popupEl, "position", "absolute");
        setStyle(this.popupEl, "left", `${coords.left - scrollerRect.left + scroller.scrollLeft}px`);
        setStyle(this.popupEl, "top", `${coords.bottom - scrollerRect.top + scroller.scrollTop + 4}px`);
      }
    }

    private insertColor(color: string) {
      if (!this.activeRange) return;
      const hex = color.startsWith("#") ? color.substring(1) : color;
      this.view.dispatch({
        changes: {
          from: this.activeRange.from,
          to: this.activeRange.to,
          insert: hex
        },
        selection: { anchor: this.activeRange.from + hex.length }
      });
      this.destroyPopup();
    }
  }
);

function getCurrentSectionOfLine(doc: Text, lineNo: number, block: DeclBlockRange): "colors" | "text" | "default" | "notes" {
  const startLine = doc.lineAt(block.from).number;
  let currentSection: "colors" | "text" | "default" | "notes" = "default";
  for (let l = startLine + 1; l <= lineNo; l++) {
    const text = doc.line(l).text.trim();
    if (text.startsWith("##")) {
      const sectionName = text.slice(2).trim().toLowerCase();
      if (sectionName === "colors" || sectionName === "colour" || sectionName === "colours") {
        currentSection = "colors";
      } else if (sectionName === "text") {
        currentSection = "text";
      }
    } else if (text.toLowerCase().startsWith("#notes")) {
      currentSection = "notes";
    }
  }
  return currentSection;
}

function isColorPropertyLine(lineText: string, section: string): boolean {
  const eqIdx = lineText.indexOf("=");
  if (eqIdx === -1) return false;
  const key = lineText.substring(0, eqIdx).trim();
  if (section === "colors") return true;
  if (/color|colour/i.test(key)) return true;
  return false;
}

/* ── Helpers ── */

function getListLevel(state: EditorState, pos: number): number {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  let level = 0;
  while (node) {
    if (node.name === "BulletList" || node.name === "OrderedList") {
      level++;
    }
    node = node.parent;
  }
  if (level === 0) {
    const lineText = state.doc.lineAt(pos).text;
    const indentMatch = /^([ \t]*)/.exec(lineText);
    if (indentMatch) {
      const indent = indentMatch[1] || "";
      let spaceCount = 0;
      let tabCount = 0;
      for (const char of indent) {
        if (char === "\t") tabCount++;
        else if (char === " ") spaceCount++;
      }
      level = tabCount + Math.floor(spaceCount / 4) + 1;
    } else {
      level = 1;
    }
  }
  return level;
}

function shouldReparse(update: ViewUpdate, blocks: DeclBlockRange[]): boolean {
  let hit = false;
  update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (blocks.some((b) => rangesIntersect(fromA, toA, b.from, b.to))) { hit = true; return; }
    if (update.state.doc.lineAt(fromB).number <= 20) { hit = true; return; }
    const s = update.state.doc.sliceString(fromB, Math.min(toB, fromB + 2000));
    if (s.includes(":::vars") || s.includes("---")) hit = true;
  });
  return hit;
}

function isInDeclBlock(pos: number, blocks: DeclBlockRange[]): boolean {
  return blocks.some(b => pos >= b.from && pos <= b.to);
}

function isInCodeOrMath(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (CODE_NODE_NAMES.has(node.name) || node.name.toLowerCase().includes("math")) return true;
    node = node.parent;
  }
  return false;
}

function rangesIntersect(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

function setStyle(el: HTMLElement, name: string, value: string): void {
  el.style.setProperty(name, value);
}
