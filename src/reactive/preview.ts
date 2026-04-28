import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text } from "@codemirror/state";
import { buildVarsMap, parseDeclarations, resolveDeclarations, VarEntry } from "./engine";
import { applyCssVarsToElement } from "./utils";

export function createPreviewProcessor(app: App) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await app.vault.cachedRead(file);
    const doc = Text.of(content.split("\n"));
    const parseResult = parseDeclarations(doc);
    const resolveResult = resolveDeclarations(parseResult.decls);
    const vars = buildVarsMap(resolveResult.resolved, new Map());

    const container = el.closest(".markdown-preview-view") as HTMLElement | null;
    if (container) {
      applyCssVarsToElement(container, vars);
    }

    applyInlineSubstitutions(el, vars);
  };
}

function applyInlineSubstitutions(el: HTMLElement, vars: Map<string, VarEntry>) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!(node instanceof Text)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.nodeValue || (!node.nodeValue.includes("@") && !node.nodeValue.includes("{"))) {
        return NodeFilter.FILTER_REJECT;
      }

      if (isInCodeNode(node) || isInReactiveNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const fragment = renderTextNode(node.nodeValue ?? "", vars);
    if (fragment) {
      node.replaceWith(fragment);
    }
  }
}

function renderTextNode(text: string, vars: Map<string, VarEntry>): DocumentFragment | null {
  const fragment = document.createDocumentFragment();
  let index = 0;
  let changed = false;

  while (index < text.length) {
    const funcMatch = nextFunctionMatch(text, index);
    const varMatch = nextVarMatch(text, index);
    const next = pickNextMatch(funcMatch, varMatch);

    if (!next) {
      fragment.appendChild(document.createTextNode(text.slice(index)));
      break;
    }

    if (next.index > index) {
      fragment.appendChild(document.createTextNode(text.slice(index, next.index)));
    }

    if (next.kind === "func") {
      const varEntry = vars.get(next.name);
      const color = varEntry && varEntry.type === "color" ? String(varEntry.val) : undefined;
      fragment.appendChild(createStyledSpan(next.text, color, !color));
    } else {
      const varEntry = vars.get(next.name);
      fragment.appendChild(createVarSpan(next.name, varEntry));
    }

    index = next.index + next.length;
    changed = true;
  }

  return changed ? fragment : null;
}

function nextFunctionMatch(text: string, start: number) {
  const regex = /\(([^)]+)\)\{@([A-Za-z_][A-Za-z0-9_]*)\}/g;
  regex.lastIndex = start;
  const match = regex.exec(text);
  if (!match) {
    return null;
  }

  return {
    kind: "func" as const,
    index: match.index,
    length: match[0].length,
    text: match[1],
    name: match[2]
  };
}

function nextVarMatch(text: string, start: number) {
  const regex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  regex.lastIndex = start;
  const match = regex.exec(text);
  if (!match) {
    return null;
  }

  return {
    kind: "var" as const,
    index: match.index,
    length: match[0].length,
    name: match[1]
  };
}

function pickNextMatch(
  funcMatch: ReturnType<typeof nextFunctionMatch>,
  varMatch: ReturnType<typeof nextVarMatch>
) {
  if (!funcMatch && !varMatch) {
    return null;
  }
  if (funcMatch && !varMatch) {
    return funcMatch;
  }
  if (!funcMatch && varMatch) {
    return varMatch;
  }

  if (funcMatch && varMatch) {
    return funcMatch.index <= varMatch.index ? funcMatch : varMatch;
  }

  return null;
}

function createVarSpan(name: string, entry?: VarEntry): HTMLElement {
  const span = document.createElement("span");
  span.className = "rv-var";

  if (!entry || entry.type === "error") {
    span.classList.add("rv-var--error");
    span.textContent = `@${name}`;
    return span;
  }

  const display = String(entry.val);
  if (entry.type === "color") {
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

function createStyledSpan(text: string, color?: string, hasError?: boolean): HTMLElement {
  const span = document.createElement("span");
  span.className = "rv-func";
  span.textContent = text;
  if (color) {
    span.style.color = color;
  }
  if (hasError) {
    span.classList.add("rv-func--error");
  }
  return span;
}

function isInCodeNode(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (el.tagName === "CODE" || el.tagName === "PRE") {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function isInReactiveNode(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (el.classList.contains("rv-var") || el.classList.contains("rv-func")) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}
