import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import {
  parseDeclarations,
  RuleEntry,
  FontRuleEntry,
  isColorString,
  findWrapperMatchesInText
} from "./engine";
import { applyCssVarsToElement, getEnabledStyles, getTextSizeCssVar, hasEnabledStyles } from "./utils";
import type { ReactiveFeatureOptions } from "./utils";
import { ChainCommand, CommandRule, resolveChainedStyles } from "./commands";

export function createPreviewProcessor(app: App, options: ReactiveFeatureOptions) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await app.vault.cachedRead(file);
    const doc = CmText.of(content.split("\n"));
    const { rules, fontRules, commands } = parseDeclarations(doc, options.globalVars);

    const container = el.closest(".markdown-preview-view");
    if (container instanceof HTMLElement) {
      applyCssVarsToElement(container, rules, [], options);

      const globalFont = fontRules.get("font");
      if (globalFont) {
        container.style.setProperty("--concrete-note-font", globalFont.cssValue);
        container.classList.add("concrete-has-font");
      } else {
        container.style.removeProperty("--concrete-note-font");
        container.classList.remove("concrete-has-font");
      }
    }

    applyInlineSubstitutions(el, rules, fontRules, commands, options);
  };
}

function applyInlineSubstitutions(
  el: HTMLElement,
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  commands: CommandRule[],
  options: ReactiveFeatureOptions
) {
  const wrappers = Array.from(rules.values()).filter(r => r.type === "wrapper" && hasEnabledStyles(r, options));
  if (wrappers.length === 0) return;

  const nodes: Text[] = [];
  const walker = activeDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) {
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
    const textVal = node.nodeValue ?? "";
    const fragment = renderTextNode(textVal, wrappers, rules, fontRules, commands, options, el.ownerDocument);
    if (fragment) {
      node.replaceWith(fragment);
    }
  }
}

function renderTextNode(
  text: string,
  wrappers: RuleEntry[],
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  commands: CommandRule[],
  options: ReactiveFeatureOptions,
  doc: Document = activeDocument
): DocumentFragment | null {
  const matches = findWrapperMatchesInText(text, 0, wrappers);
  if (matches.length === 0) return null;

  return buildDOMTree(text, 0, text.length, matches, rules, fontRules, commands, options, doc);
}

function buildDOMTree(
  text: string,
  from: number,
  to: number,
  matches: ReturnType<typeof findWrapperMatchesInText>,
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  commands: CommandRule[],
  options: ReactiveFeatureOptions,
  doc: Document = activeDocument
): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  let index = from;
  const chainCmds = commands.filter((c): c is ChainCommand => c.type === "chain");

  const innerMatches = matches.filter(m => m.fullFrom >= from && m.fullTo <= to);

  while (index < to) {
    const nextMatch = innerMatches.find(m => m.fullFrom >= index);
    if (!nextMatch) {
      fragment.appendChild(doc.createTextNode(text.slice(index, to)));
      break;
    }

    if (nextMatch.fullFrom > index) {
      fragment.appendChild(doc.createTextNode(text.slice(index, nextMatch.fullFrom)));
    }

    const span = createSpan();
    span.className = "rv-styled";
    
    for (const style of getEnabledStyles(nextMatch.rule, options)) {
      if (style.section === "colors" || isColorString(style.val)) {
        span.style.color = style.val;
      } else if (style.val.startsWith("font:")) {
        const fName = style.val.slice(5);
        const fRule = fontRules.get(fName);
        if (fRule && options.enableTextVariables) {
          span.style.fontFamily = fRule.cssValue;
        }
      } else {
        span.classList.add(`rv-${style.val}`);
        const textSizeCssVar = getTextSizeCssVar(style.val, rules, options);
        if (textSizeCssVar) {
          span.style.fontSize = `var(${textSizeCssVar})`;
        }
      }
    }

    // Follow chained styles
    if (chainCmds.length > 0) {
      const chained = resolveChainedStyles([nextMatch.rule.key], chainCmds);
      for (const cStyle of chained) {
        if (cStyle !== nextMatch.rule.key) {
          if (isColorString(cStyle)) {
            span.style.color = cStyle;
          } else {
            const fRule = fontRules.get(cStyle) ?? fontRules.get(cStyle.replace(/^text_/, "").replace(/_font$/, ""));
            if (fRule && options.enableTextVariables) {
              span.style.fontFamily = fRule.cssValue;
            }
          }
        }
      }
    }

    const innerContent = buildDOMTree(text, nextMatch.contentFrom, nextMatch.contentTo, innerMatches, rules, fontRules, commands, options, doc);
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
