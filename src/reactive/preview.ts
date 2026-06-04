import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import { parseDeclarations, RuleEntry, isColorString, findWrapperMatchesInText } from "./engine";
import { applyCssVarsToElement, getEnabledStyles, getTextSizeCssVar, hasEnabledStyles } from "./utils";
import type { ReactiveFeatureOptions } from "./utils";

export function createPreviewProcessor(app: App, options: ReactiveFeatureOptions) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await app.vault.cachedRead(file);
    const doc = CmText.of(content.split("\n"));
    const { rules } = parseDeclarations(doc, options.globalVars);

    const container = el.closest(".markdown-preview-view");
    if (container instanceof HTMLElement) {
      applyCssVarsToElement(container, rules, [], options);
    }

    applyInlineSubstitutions(el, rules, options);
  };
}

function applyInlineSubstitutions(el: HTMLElement, rules: Map<string, RuleEntry>, options: ReactiveFeatureOptions) {
  const wrappers = Array.from(rules.values()).filter(r => r.type === "wrapper" && hasEnabledStyles(r, options));
  if (wrappers.length === 0) return;

  const nodes: Text[] = [];
  const walker = activeDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      if (!(node.instanceOf(Text)) || !node.nodeValue) {
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
    const fragment = renderTextNode(node.nodeValue ?? "", wrappers, rules, options);
    if (fragment) {
      node.replaceWith(fragment);
    }
  }
}

function renderTextNode(
  text: string,
  wrappers: RuleEntry[],
  rules: Map<string, RuleEntry>,
  options: ReactiveFeatureOptions
): DocumentFragment | null {
  const matches = findWrapperMatchesInText(text, 0, wrappers);
  if (matches.length === 0) return null;

  return buildDOMTree(text, 0, text.length, matches, rules, options);
}

function buildDOMTree(
  text: string,
  from: number,
  to: number,
  matches: ReturnType<typeof findWrapperMatchesInText>,
  rules: Map<string, RuleEntry>,
  options: ReactiveFeatureOptions
): DocumentFragment {
  const fragment = createFragment();
  let index = from;

  const innerMatches = matches.filter(m => m.fullFrom >= from && m.fullTo <= to);

  while (index < to) {
    const nextMatch = innerMatches.find(m => m.fullFrom >= index);
    if (!nextMatch) {
      fragment.appendChild(activeDocument.createTextNode(text.slice(index, to)));
      break;
    }

    if (nextMatch.fullFrom > index) {
      fragment.appendChild(activeDocument.createTextNode(text.slice(index, nextMatch.fullFrom)));
    }

    const span = createSpan();
    span.className = "rv-styled";
    
    for (const style of getEnabledStyles(nextMatch.rule, options)) {
      if (style.section === "colors" || isColorString(style.val)) {
        span.style.color = style.val;
      } else {
        span.classList.add(`rv-${style.val}`);
        const textSizeCssVar = getTextSizeCssVar(style.val, rules, options);
        if (textSizeCssVar) {
          span.style.fontSize = `var(${textSizeCssVar})`;
        }
      }
    }

    const innerContent = buildDOMTree(text, nextMatch.contentFrom, nextMatch.contentTo, innerMatches, rules, options);
    span.appendChild(innerContent);
    fragment.appendChild(span);

    index = nextMatch.fullTo;
  }

  return fragment;
}


function isInCodeNode(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (
      el.tagName === "CODE" ||
      el.tagName === "PRE" ||
      el.classList.contains("math") ||
      el.classList.contains("math-block") ||
      el.classList.contains("math-inline")
    ) {
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
