import {
  EditorState,
  Extension,
  StateEffect,
  StateField
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

import {
  DeclBlockRange,
  isColorString,
  RuleEntry,
  parseDeclarations,
  findWrapperMatchesInText,
  parseDashLevel
} from "./engine";
import { applyCssVarsToElement } from "./utils";

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

const varStateField = StateField.define<VarState>({
  create(state) {
    const { rules, blocks } = parseDeclarations(state.doc);
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

export function reactiveVariablesExtension(): Extension {
  return [
    varStateField,
    foldedSetField,
    decorationPlugin,
    cssVarPlugin,
    debouncedReparsePlugin
  ];
}

const decorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); }
    update(update: ViewUpdate) {
      if (
        update.docChanged || update.selectionSet || update.viewportChanged ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(reparseEffect) || e.is(toggleFoldEffect))
        )
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const cssVarPlugin = ViewPlugin.fromClass(
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
      this.lastKeys = applyCssVarsToElement(c as HTMLElement, vs.rules, this.lastKeys);
      this.lastVersion = vs.version;
    }
  }
);

const debouncedReparsePlugin = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;
    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      const vs = update.startState.field(varStateField);
      if (!shouldReparse(update, vs.blocks)) return;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const { rules, blocks } = parseDeclarations(update.state.doc);
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
    const w = document.createElement("span");
    w.className = "rv-color-picker-wrapper";
    const input = document.createElement("input");
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

const BULLET_CHARS = ["•", "◦", "▸", "▹", "⁃", "·"];
class BulletWidget extends WidgetType {
  constructor(public level: number) { super(); }
  eq(other: BulletWidget) { return other.level === this.level; }
  toDOM() {
    const s = document.createElement("span");
    s.className = `rv-bullet rv-bullet-${this.level}`;
    s.textContent = BULLET_CHARS[Math.min(this.level - 1, BULLET_CHARS.length - 1)] + " ";
    return s;
  }
}

class FoldToggleWidget extends WidgetType {
  constructor(public summary: string, public lineNum: number, public folded: boolean) { super(); }
  eq(other: FoldToggleWidget) { return other.summary === this.summary && other.lineNum === this.lineNum && other.folded === this.folded; }
  ignoreEvent() { return true; }
  toDOM(view: EditorView) {
    const btn = document.createElement("span");
    btn.className = "rv-fold-widget";
    btn.textContent = this.folded ? `▶ ${this.summary}` : "▼";
    const ln = this.lineNum;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Use setTimeout to avoid race conditions with CM event handling
      setTimeout(() => {
        view.dispatch({ effects: [toggleFoldEffect.of(ln)] });
      }, 0);
    });
    return btn;
  }
}

/* ── Decorations ── */

function buildDecorations(view: EditorView): DecorationSet {
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
          if (style.section === "colors") colors++;
          else if (style.section === "text") textStyles++;
          else colors++;
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

    // When folded, hide every line AFTER the :::vars line using line decorations + CSS
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
  for (const rule of varState.rules.values()) {
    for (const style of rule.styles) {
      // Skip if inside a folded block
      const inFolded = varState.blocks.some(b => {
        if (b.source !== "vars-block") return false;
        const bln = view.state.doc.lineAt(b.from).number;
        return foldedSet.has(bln) && style.valFrom >= b.from && style.valTo <= b.to;
      });
      if (inFolded) continue;

      if (isColorString(style.val)) {
        decs.push({ from: style.valFrom, to: style.valTo, value: Decoration.mark({ class: "rv-tag-override" }) });
        decs.push({ from: style.valFrom, to: style.valFrom, value: Decoration.widget({ widget: new ColorSwatchWidget(style.val, style.valFrom, style.valTo), side: -1 }) });
      }
    }
  }

  // Wrapper + dash decorations
  const wrappers = Array.from(varState.rules.values()).filter(r => r.type === "wrapper");
  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;
    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      if (isInDeclBlock(line.from, varState.blocks)) continue;

      const dashLevel = parseDashLevel(line.text);
      if (dashLevel > 0) {
        decs.push({ from: line.from, to: line.from, value: Decoration.line({ class: `rv-level rv-level-${Math.min(dashLevel, 6)}` }) });
        if (lineNo !== activeLine) {
          decs.push({ from: line.from, to: line.from + dashLevel + 1, value: Decoration.replace({ widget: new BulletWidget(dashLevel) }) });
        }
      }

      if (lineNo === activeLine || wrappers.length === 0) continue;
      const matches = findWrapperMatchesInText(line.text, line.from, wrappers);
      for (const m of matches) {
        if (isInCode(view.state, m.fullFrom)) continue;
        decs.push({ from: m.fullFrom, to: m.contentFrom, value: Decoration.replace({}) });
        let markClass = "rv-styled";
        let markAttrs: Record<string, string> | undefined;
        for (const style of m.rule.styles) {
          if (style.section === "colors" || isColorString(style.val)) {
            if (!markAttrs) markAttrs = {};
            markAttrs.style = (markAttrs.style || "") + `color: ${style.val};`;
          } else {
            markClass += ` rv-${style.val}`;
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

/* ── Helpers ── */

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

function isInCode(state: EditorState, pos: number): boolean {
  let node: any = syntaxTree(state).resolveInner(pos, -1);
  while (node) { if (CODE_NODE_NAMES.has(node.name)) return true; node = node.parent; }
  return false;
}

function rangesIntersect(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
