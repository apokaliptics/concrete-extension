import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { parseDeclarations, RuleEntry, isColorString } from "./engine";
import { applyCssVarsToElement } from "./utils";

export function createPreviewProcessor(app: App) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await app.vault.cachedRead(file);
    const doc = CmText.of(content.split("\n"));
    const { rules } = parseDeclarations(doc);

    const container = el.closest(".markdown-preview-view");
    if (container instanceof HTMLElement) {
      applyCssVarsToElement(container, rules);
    }

    applyInlineSubstitutions(el, rules);
  };
}

function applyInlineSubstitutions(el: HTMLElement, rules: Map<string, RuleEntry>) {
  const wrappers = Array.from(rules.values()).filter(r => r.type === "wrapper");
  if (wrappers.length === 0) return;

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!(node instanceof Text) || !node.nodeValue) {
        return NodeFilter.FILTER_REJECT;
      }
      
      const hasSym = wrappers.some(w => node.nodeValue!.includes(w.startSym!));
      if (!hasSym) return NodeFilter.FILTER_REJECT;

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
    const fragment = renderTextNode(node.nodeValue ?? "", wrappers);
    if (fragment) {
      node.replaceWith(fragment);
    }
  }
}

function renderTextNode(text: string, wrappers: RuleEntry[]): DocumentFragment | null {
  const fragment = document.createDocumentFragment();
  let index = 0;
  let changed = false;

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

    if (!bestMatch) {
      fragment.appendChild(document.createTextNode(text.slice(index)));
      break;
    }

    if (bestMatch.startIdx > index) {
      fragment.appendChild(document.createTextNode(text.slice(index, bestMatch.startIdx)));
    }

    fragment.appendChild(createStyledSpan(text.slice(bestMatch.startIdx, bestMatch.endIdx), bestMatch.rule));
    index = bestMatch.endIdx;
    changed = true;
  }

  return changed ? fragment : null;
}

function createStyledSpan(text: string, rule: RuleEntry): HTMLElement {
  const span = document.createElement("span");
  span.className = "rv-styled";
  span.textContent = text;
  
  if (rule.section === "colors" || isColorString(rule.val)) {
    span.style.color = rule.val;
  } else {
    span.classList.add(`rv-${rule.val}`);
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
    if (el.classList.contains("rv-styled")) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}
