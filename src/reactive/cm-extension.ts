import {
  EditorState,
  Extension,
  Line,
  StateEffect,
  StateField,
  Transaction
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  hoverTooltip
} from "@codemirror/view";
import {
  autocompletion,
  CompletionContext,
  CompletionResult
} from "@codemirror/autocomplete";
import { linter, Diagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  buildVarsMap,
  DeclBlockRange,
  isColorString,
  RawDecl,
  ResolvedVar,
  VarEntry,
  VarError,
  parseDeclarations,
  resolveDeclarations
} from "./engine";
import { applyCssVarsToElement } from "./utils";

const CODE_NODE_NAMES = new Set(["FencedCode", "CodeBlock", "InlineCode"]);

interface RefOccurrence {
  name: string;
  from: number;
  to: number;
  kind: "ref" | "func";
}

interface VarState {
  decls: Map<string, RawDecl>;
  resolved: Map<string, ResolvedVar>;
  errors: VarError[];
  blocks: DeclBlockRange[];
  lineRefs: Map<number, RefOccurrence[]>;
  refCounts: Map<string, number>;
  vars: Map<string, VarEntry>;
  version: number;
}

interface ReparsePayload {
  decls: Map<string, RawDecl>;
  resolved: Map<string, ResolvedVar>;
  blocks: DeclBlockRange[];
  errors: VarError[];
}

const reparseEffect = StateEffect.define<ReparsePayload>();

const varStateField = StateField.define<VarState>({
  create(state) {
    return buildVarState(state);
  },
  update(value, tr) {
    let blocks = value.blocks;
    let decls = value.decls;
    let resolved = value.resolved;
    let errors = value.errors;
    let lineRefs = value.lineRefs;
    let refCounts = value.refCounts;
    let version = value.version;

    if (tr.docChanged) {
      const mappedBlocks = mapBlocks(blocks, tr);
      const updated = updateLineRefs(tr.state, lineRefs, refCounts, tr, mappedBlocks);
      lineRefs = updated.lineRefs;
      refCounts = updated.refCounts;
      blocks = mappedBlocks;
      version += 1;
    }

    for (const effect of tr.effects) {
      if (effect.is(reparseEffect)) {
        decls = effect.value.decls;
        resolved = effect.value.resolved;
        blocks = effect.value.blocks;
        errors = effect.value.errors;
        const rebuilt = buildLineRefs(tr.state, blocks);
        lineRefs = rebuilt.lineRefs;
        refCounts = rebuilt.refCounts;
        version += 1;
      }
    }

    const vars = buildVarsMap(resolved, refCounts);

    return {
      decls,
      resolved,
      errors,
      blocks,
      lineRefs,
      refCounts,
      vars,
      version
    };
  }
});

export function reactiveVariablesExtension(): Extension {
  return [
    varStateField,
    decorationPlugin,
    cssVarPlugin,
    debouncedReparsePlugin,
    variableHoverTooltip,
    variableCompletion,
    variableLinter
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
        varState.vars,
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
        const parseResult = parseDeclarations(update.state.doc);
        const resolveResult = resolveDeclarations(parseResult.decls);
        const errors = [...parseResult.errors, ...resolveResult.errors];

        update.view.dispatch({
          effects: reparseEffect.of({
            decls: parseResult.decls,
            resolved: resolveResult.resolved,
            blocks: parseResult.blocks,
            errors
          })
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

const variableCompletion = autocompletion({
  override: [variableCompletionSource]
});

const variableHoverTooltip = hoverTooltip((view, pos) => {
  const ref = findVarAtPos(view.state, pos);
  if (!ref) {
    return null;
  }

  const varState = view.state.field(varStateField);
  const resolved = varState.resolved.get(ref.name);
  const decl = varState.decls.get(ref.name);

  return {
    pos: ref.from,
    end: ref.to,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "rv-tooltip";

      const title = document.createElement("div");
      title.className = "rv-tooltip-title";
      title.textContent = `@${ref.name}`;
      dom.appendChild(title);

      const typeRow = document.createElement("div");
      typeRow.className = "rv-tooltip-row";
      typeRow.textContent = `Type: ${resolved?.type ?? "unknown"}`;
      dom.appendChild(typeRow);

      const valueRow = document.createElement("div");
      valueRow.className = "rv-tooltip-row";
      valueRow.textContent = `Value: ${resolved ? String(resolved.val) : "undefined"}`;
      dom.appendChild(valueRow);

      if (decl) {
        const sourceRow = document.createElement("div");
        sourceRow.className = "rv-tooltip-row";
        sourceRow.textContent = `Declaration: ${decl.text.trim()}`;
        dom.appendChild(sourceRow);
      }

      return { dom };
    }
  };
});

const variableLinter = linter((view) => {
  const varState = view.state.field(varStateField);
  const diagnostics: Diagnostic[] = [];

  for (const refs of varState.lineRefs.values()) {
    for (const ref of refs) {
      if (!varState.decls.has(ref.name)) {
        diagnostics.push({
          from: ref.from,
          to: ref.to,
          severity: "error",
          message: `Undefined variable @${ref.name}`
        });
      }
    }
  }

  for (const err of varState.errors) {
    diagnostics.push({
      from: err.from,
      to: err.to,
      severity: "error",
      message: err.message
    });
  }

  return diagnostics;
});

class VarValueWidget extends WidgetType {
  constructor(private name: string, private entry?: VarEntry) {
    super();
  }

  eq(other: VarValueWidget): boolean {
    return (
      other.name === this.name &&
      other.entry?.val === this.entry?.val &&
      other.entry?.type === this.entry?.type
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "rv-var";

    if (!this.entry || this.entry.type === "error") {
      span.classList.add("rv-var--error");
      span.textContent = `@${this.name}`;
      return span;
    }

    const display = String(this.entry.val);
    if (this.entry.type === "color" && isColorString(display)) {
      span.classList.add("rv-var--color");
      const swatch = document.createElement("span");
      swatch.className = "rv-swatch";
      swatch.style.background = display;
      const text = document.createElement("span");
      text.textContent = display;
      span.appendChild(swatch);
      span.appendChild(text);
      return span;
    }

    span.textContent = display;
    return span;
  }
}

class StyledTextWidget extends WidgetType {
  constructor(private text: string, private color?: string, private hasError?: boolean) {
    super();
  }

  eq(other: StyledTextWidget): boolean {
    return (
      other.text === this.text &&
      other.color === this.color &&
      other.hasError === this.hasError
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "rv-func";
    span.textContent = this.text;
    if (this.color) {
      span.style.color = this.color;
    }
    if (this.hasError) {
      span.classList.add("rv-func--error");
    }
    return span;
  }
}

function buildVarState(state: EditorState): VarState {
  const parseResult = parseDeclarations(state.doc);
  const resolveResult = resolveDeclarations(parseResult.decls);
  const errors = [...parseResult.errors, ...resolveResult.errors];
  const { lineRefs, refCounts } = buildLineRefs(state, parseResult.blocks);
  const vars = buildVarsMap(resolveResult.resolved, refCounts);

  return {
    decls: parseResult.decls,
    resolved: resolveResult.resolved,
    errors,
    blocks: parseResult.blocks,
    lineRefs,
    refCounts,
    vars,
    version: 1
  };
}

function buildLineRefs(
  state: EditorState,
  blocks: DeclBlockRange[]
): { lineRefs: Map<number, RefOccurrence[]>; refCounts: Map<string, number> } {
  const lineRefs = new Map<number, RefOccurrence[]>();
  const refCounts = new Map<string, number>();

  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const refs = findLineRefs(state, line, blocks);
    if (refs.length > 0) {
      lineRefs.set(line.from, refs);
      addRefs(refCounts, refs);
    }
  }

  return { lineRefs, refCounts };
}

function updateLineRefs(
  state: EditorState,
  oldLineRefs: Map<number, RefOccurrence[]>,
  oldRefCounts: Map<string, number>,
  tr: Transaction,
  blocks: DeclBlockRange[]
): { lineRefs: Map<number, RefOccurrence[]>; refCounts: Map<string, number> } {
  const lineRefs = new Map<number, RefOccurrence[]>();
  const refCounts = new Map<string, number>(oldRefCounts);
  const oldRanges: Array<[number, number]> = [];
  const newRanges: Array<[number, number]> = [];

  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    oldRanges.push([fromA, toA]);
    newRanges.push([fromB, toB]);
  });

  const isOldChanged = (pos: number) => isPosInRanges(pos, oldRanges);

  for (const [linePos, refs] of oldLineRefs) {
    if (isOldChanged(linePos)) {
      removeRefs(refCounts, refs);
      continue;
    }

    const mappedPos = tr.changes.mapPos(linePos, -1);
    lineRefs.set(mappedPos, refs);
  }

  for (const [fromB, toB] of newRanges) {
    const startLine = state.doc.lineAt(fromB).number;
    const endLine = state.doc.lineAt(toB).number;
    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      const line = state.doc.line(lineNo);
      const refs = findLineRefs(state, line, blocks);
      if (refs.length > 0) {
        lineRefs.set(line.from, refs);
        addRefs(refCounts, refs);
      } else {
        lineRefs.delete(line.from);
      }
    }
  }

  return { lineRefs, refCounts };
}

function findLineRefs(
  state: EditorState,
  line: Line,
  blocks: DeclBlockRange[]
): RefOccurrence[] {
  if (isInDeclBlock(line.from, blocks)) {
    return [];
  }

  const refs: RefOccurrence[] = [];
  const usedRanges: Array<[number, number]> = [];
  const text = line.text;

  const funcRegex = /\(([^)]+)\)\{@([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = funcRegex.exec(text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (!isInCode(state, from)) {
      const name = match[2];
      if (name == null) {
        continue;
      }
      refs.push({ name, from, to, kind: "func" });
      usedRanges.push([from, to]);
    }
  }

  const refRegex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((match = refRegex.exec(text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (isRangeOverlapping(usedRanges, from, to)) {
      continue;
    }
    if (!isInCode(state, from)) {
      const name = match[1];
      if (name == null) {
        continue;
      }
      refs.push({ name, from, to, kind: "ref" });
    }
  }

  return refs;
}

function buildDecorations(view: EditorView): DecorationSet {
  const varState = view.state.field(varStateField);
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const decorations: Array<{ from: number; to: number; value: Decoration }> = [];

  for (const range of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;

    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      if (lineNo === activeLine) {
        continue;
      }

      const line = view.state.doc.line(lineNo);
      if (isInDeclBlock(line.from, varState.blocks)) {
        continue;
      }

      const lineDecorations = buildLineDecorations(view.state, line, varState);
      for (const deco of lineDecorations) {
        decorations.push(deco);
      }
    }
  }

  return Decoration.set(decorations, true);
}

function buildLineDecorations(
  state: EditorState,
  line: Line,
  varState: VarState
): Array<{ from: number; to: number; value: Decoration }> {
  const decorations: Array<{ from: number; to: number; value: Decoration }> = [];
  const text = line.text;
  const usedRanges: Array<[number, number]> = [];

  const funcRegex = /\(([^)]+)\)\{@([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = funcRegex.exec(text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (isInCode(state, from)) {
      continue;
    }

    const name = match[2];
    const label = match[1];
    if (name == null || label == null) {
      continue;
    }
    const entry = varState.vars.get(name);
    const color = entry && entry.type === "color" ? String(entry.val) : undefined;
    const widget = new StyledTextWidget(label, color, !color);
    decorations.push({
      from,
      to,
      value: Decoration.replace({ widget })
    });
    usedRanges.push([from, to]);
  }

  const refRegex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((match = refRegex.exec(text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (isRangeOverlapping(usedRanges, from, to)) {
      continue;
    }
    if (isInCode(state, from)) {
      continue;
    }

    const name = match[1];
    if (name == null) {
      continue;
    }
    const entry = varState.vars.get(name);
    const widget = new VarValueWidget(name, entry);
    decorations.push({
      from,
      to,
      value: Decoration.replace({ widget })
    });
  }

  return decorations;
}

function variableCompletionSource(
  context: CompletionContext
): CompletionResult | null {
  const word = context.matchBefore(/@[A-Za-z_][A-Za-z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const varState = context.state.field(varStateField);
  const options = Array.from(varState.vars.entries()).map(([name, entry]) => ({
    label: `@${name}`,
    type: "variable",
    detail: `${entry.type}: ${String(entry.val)}`,
    apply: `@${name}`
  }));

  return {
    from: word.from,
    options
  };
}

function findVarAtPos(
  state: EditorState,
  pos: number
): { name: string; from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const refRegex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;

  while ((match = refRegex.exec(text))) {
    const from = line.from + match.index;
    const to = from + match[0].length;
    if (pos >= from && pos <= to) {
      if (isInCode(state, from)) {
        return null;
      }
      const name = match[1];
      if (name == null) {
        return null;
      }
      return { name, from, to };
    }
  }

  return null;
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

function mapBlocks(blocks: DeclBlockRange[], tr: Transaction) {
  return blocks.map((block) => ({
    ...block,
    from: tr.changes.mapPos(block.from, -1),
    to: tr.changes.mapPos(block.to, 1)
  }));
}

function isInDeclBlock(pos: number, blocks: DeclBlockRange[]): boolean {
  for (const block of blocks) {
    if (pos >= block.from && pos <= block.to) {
      return true;
    }
  }
  return false;
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

function isPosInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([from, to]) => pos >= from && pos <= to);
}

function isRangeOverlapping(
  ranges: Array<[number, number]>,
  from: number,
  to: number
): boolean {
  return ranges.some(([rangeFrom, rangeTo]) => from < rangeTo && to > rangeFrom);
}

function addRefs(counts: Map<string, number>, refs: RefOccurrence[]) {
  for (const ref of refs) {
    const cur = counts.get(ref.name) ?? 0;
    counts.set(ref.name, cur + 1);
  }
}

function removeRefs(counts: Map<string, number>, refs: RefOccurrence[]) {
  for (const ref of refs) {
    const cur = counts.get(ref.name) ?? 0;
    if (cur <= 1) {
      counts.delete(ref.name);
    } else {
      counts.set(ref.name, cur - 1);
    }
  }
}
