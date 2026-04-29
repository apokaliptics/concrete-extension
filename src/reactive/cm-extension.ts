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
import type { SyntaxNode } from "@lezer/common";
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
      blocks = blocks.map((block) => ({
        ...block,
        from: tr.changes.mapPos(block.from, -1),
        to: tr.changes.mapPos(block.to, 1)
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

export function reactiveVariablesExtension(): Extension {
  return [
    varStateField,
    decorationPlugin,
    cssVarPlugin,
    debouncedReparsePlugin
  ];
}

const decorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const hasReparse = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(reparseEffect))
      );

      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        hasReparse
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
);

const cssVarPlugin = ViewPlugin.fromClass(
  class {
    private lastKeys: string[] = [];
    private lastVersion = -1;

    constructor(private view: EditorView) {
      this.apply(view.state);
    }

    update(update: ViewUpdate) {
      const varState = update.state.field(varStateField);
      if (varState.version !== this.lastVersion) {
        this.apply(update.state);
      }
    }

    private apply(state: EditorState) {
      const varState = state.field(varStateField);
      const container =
        this.view.dom.closest(".markdown-source-view") ?? this.view.dom;
      if (!container) {
        return;
      }

      this.lastKeys = applyCssVarsToElement(
        container as HTMLElement,
        varState.rules,
        this.lastKeys
      );
      this.lastVersion = varState.version;
    }
  }
);

const debouncedReparsePlugin = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;

    update(update: ViewUpdate) {
      if (!update.docChanged) {
        return;
      }

      const varState = update.startState.field(varStateField);
      if (!shouldReparse(update, varState.blocks)) {
        return;
      }

      if (this.timer) {
        window.clearTimeout(this.timer);
      }

      this.timer = window.setTimeout(() => {
        const { rules, blocks } = parseDeclarations(update.state.doc);
        update.view.dispatch({
          effects: reparseEffect.of({ rules, blocks })
        });
      }, 200);
    }

    destroy() {
      if (this.timer) {
        window.clearTimeout(this.timer);
      }
    }
  }
);

/* ── Widgets ── */

class ColorSwatchWidget extends WidgetType {
  constructor(public color: string, public from: number, public to: number) {
    super();
  }

  eq(other: ColorSwatchWidget) {
    return other.color === this.color && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "rv-color-picker-wrapper";

    const input = document.createElement("input");
    input.type = "color";

    let hexColor = this.color;
    if (hexColor.length === 4) {
      hexColor = "#" + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2] + hexColor[3] + hexColor[3];
    }
    input.value = hexColor;
    input.className = "rv-color-picker";
    input.onchange = () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: input.value }
      });
    };

    wrapper.appendChild(input);
    return wrapper;
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
    const span = document.createElement("span");
    span.className = `rv-bullet rv-bullet-${this.level}`;
    span.textContent = BULLET_CHARS[Math.min(this.level - 1, BULLET_CHARS.length - 1)] + " ";
    return span;
  }
}

/* ── Decorations ── */

function buildDecorations(view: EditorView): DecorationSet {
  const varState = view.state.field(varStateField);
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const decorations: Array<{ from: number; to: number; value: Decoration }> = [];

  // Color swatches inside the :::vars block
  for (const rule of varState.rules.values()) {
    for (const style of rule.styles) {
      if (isColorString(style.val)) {
        decorations.push({
          from: style.valFrom,
          to: style.valTo,
          value: Decoration.mark({ class: "rv-tag-override" })
        });
        decorations.push({
          from: style.valFrom,
          to: style.valFrom,
          value: Decoration.widget({
            widget: new ColorSwatchWidget(style.val, style.valFrom, style.valTo),
            side: -1
          })
        });
      }
    }
  }

  const wrappers = Array.from(varState.rules.values()).filter(r => r.type === "wrapper");

  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;

    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      if (isInDeclBlock(line.from, varState.blocks)) continue;

      // ── Dash-level decorations ──
      const dashLevel = parseDashLevel(line.text);
      if (dashLevel > 0) {
        decorations.push({
          from: line.from,
          to: line.from,
          value: Decoration.line({ class: `rv-level rv-level-${Math.min(dashLevel, 6)}` })
        });

        if (lineNo !== activeLine) {
          // Ghost dash: hide dashes + trailing space, replace with bullet
          const dashEnd = line.from + dashLevel;
          // Also skip the space after dashes
          const replaceEnd = dashEnd + 1;
          decorations.push({
            from: line.from,
            to: replaceEnd,
            value: Decoration.replace({
              widget: new BulletWidget(dashLevel)
            })
          });
        }
      }

      // ── Wrapper decorations (skip active line) ──
      if (lineNo === activeLine) continue;
      if (wrappers.length === 0) continue;

      const matches = findWrapperMatchesInText(line.text, line.from, wrappers);

      for (const m of matches) {
        if (isInCode(view.state, m.fullFrom)) continue;

        // Hide start delimiter
        decorations.push({
          from: m.fullFrom,
          to: m.contentFrom,
          value: Decoration.replace({})
        });

        // Style the content
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

        decorations.push({
          from: m.contentFrom,
          to: m.contentTo,
          value: Decoration.mark({
            class: markClass,
            ...(markAttrs ? { attributes: markAttrs } : {})
          })
        });

        // Hide end delimiter
        decorations.push({
          from: m.contentTo,
          to: m.fullTo,
          value: Decoration.replace({})
        });
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(decorations, true);
}

/* ── Helpers ── */

function shouldReparse(update: ViewUpdate, blocks: DeclBlockRange[]): boolean {
  let hit = false;
  update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (blocks.some((block) => rangesIntersect(fromA, toA, block.from, block.to))) {
      hit = true;
      return;
    }

    const startLine = update.state.doc.lineAt(fromB).number;
    if (startLine <= 20) {
      hit = true;
      return;
    }

    const snippet = update.state.doc.sliceString(fromB, Math.min(toB, fromB + 2000));
    if (snippet.includes(":::vars") || snippet.includes("---")) {
      hit = true;
    }
  });

  return hit;
}

function isInDeclBlock(pos: number, blocks: DeclBlockRange[]): boolean {
  return blocks.some(b => pos >= b.from && pos <= b.to);
}

function isInCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (CODE_NODE_NAMES.has(node.name)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function rangesIntersect(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
