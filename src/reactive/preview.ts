import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { parseDeclarations, RuleEntry, isColorString, findWrapperMatchesInText, parseDashLevel } from "./engine";
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
    applyLineSubstitutions(el);
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
  const matches = findWrapperMatchesInText(text, 0, wrappers);
  if (matches.length === 0) return null;

  const fragment = document.createDocumentFragment();
  let index = 0;

  for (const m of matches) {
    // Text before the match
    if (m.fullFrom > index) {
      fragment.appendChild(document.createTextNode(text.slice(index, m.fullFrom)));
    }

    // Content only (delimiters hidden)
    const contentText = text.slice(m.contentFrom, m.contentTo);
    const span = document.createElement("span");
    span.className = "rv-styled";
    span.textContent = contentText;

    if (m.rule.section === "colors" || isColorString(m.rule.val)) {
      span.style.color = m.rule.val;
    } else {
      span.classList.add(`rv-${m.rule.val}`);
    }

    fragment.appendChild(span);
    index = m.fullTo;
  }

  if (index < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(index)));
  }

  return fragment;
}

function applyLineSubstitutions(el: HTMLElement) {
  const BULLET_CHARS = ["•", "◦", "▸", "▹", "⁃", "·"];
  const paragraphs = el.querySelectorAll("p");

  for (const p of Array.from(paragraphs)) {
    const firstChild = p.firstChild;
    if (!(firstChild instanceof window.Text)) continue;

    const text = firstChild.nodeValue ?? "";
    const level = parseDashLevel(text);
    if (level === 0) continue;

    p.classList.add("rv-level", `rv-level-${Math.min(level, 6)}`);

    const bullet = BULLET_CHARS[Math.min(level - 1, BULLET_CHARS.length - 1)];
    firstChild.nodeValue = bullet + " " + text.slice(level).trimStart();
  }
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
