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
  ViewUpdate
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  DeclBlockRange,
  isColorString,
  RuleEntry,
  parseDeclarations
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

function buildDecorations(view: EditorView): DecorationSet {
  const varState = view.state.field(varStateField);
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const decorations: Array<{ from: number; to: number; value: Decoration }> = [];
  
  const wrappers = Array.from(varState.rules.values()).filter(r => r.type === "wrapper");
  if (wrappers.length === 0) return Decoration.none;

  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;

    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      if (lineNo === activeLine) continue;

      const line = view.state.doc.line(lineNo);
      if (isInDeclBlock(line.from, varState.blocks)) continue;

      const text = line.text;
      let index = 0;

      while (index < text.length) {
        let bestMatch: { rule: RuleEntry, startIdx: number, endIdx: number } | null = null;

        for (const rule of wrappers) {
          const startSym = rule.startSym!;
          const endSym = rule.endSym!;

          const startIdx = text.indexOf(startSym, index);
          if (startIdx !== -1) {
            const contentStart = startIdx + startSym.length;
            const endIdx = text.indexOf(endSym, contentStart);
            if (endIdx !== -1) {
              if (!bestMatch || startIdx < bestMatch.startIdx) {
                bestMatch = { rule, startIdx, endIdx: endIdx + endSym.length };
              }
            }
          }
        }

        if (!bestMatch) break;
        
        const from = line.from + bestMatch.startIdx;
        const to = line.from + bestMatch.endIdx;
        
        if (!isInCode(view.state, from)) {
          let markDeco;
          if (isColorString(bestMatch.rule.val)) {
            markDeco = Decoration.mark({
              attributes: { style: `color: ${bestMatch.rule.val}` },
              class: "rv-styled"
            });
          } else if (bestMatch.rule.val === "header") {
            markDeco = Decoration.mark({
              class: "rv-styled rv-header"
            });
          } else {
            markDeco = Decoration.mark({
              class: `rv-styled rv-${bestMatch.rule.val}`
            });
          }

          decorations.push({ from, to, value: markDeco });
        }
        
        index = bestMatch.endIdx;
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

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
