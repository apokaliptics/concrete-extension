import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { Text as CmText } from "@codemirror/state";
import {
  parseDeclarations,
  RuleEntry,
  FontRuleEntry,
  isColorString,
  findWrapperMatchesInText,
  resolveMultipleStyles
} from "./engine";
import { applyCssVarsToElement, getEnabledStyles, getTextSizeCssVar, hasEnabledStyles } from "./utils";
import type { ReactiveFeatureOptions } from "./utils";
import {
  ChainCommand,
  CommandRule,
  ProgramNode,
  SliceDecorationSpec,
  evaluateCommands,
  evaluateSpanStyles,
  getLineTokens,
  resolveChainedStyles
} from "./commands";

const BLOCK_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";

export function createPreviewProcessor(app: App, options: ReactiveFeatureOptions) {
  return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await app.vault.cachedRead(file);
    const doc = CmText.of(content.split("\n"));
    const { rules, fontRules, commands, compiledCommands } = parseDeclarations(doc, options.globalVars);

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

    applyBlockCommands(el, rules, fontRules, compiledCommands, options);
    applyInlineSubstitutions(el, rules, fontRules, commands, compiledCommands, options);
  };
}

function applyBlockCommands(
  el: HTMLElement,
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  compiledCommands: ProgramNode,
  options: ReactiveFeatureOptions
) {
  if (compiledCommands.body.length === 0) return;

  const blocks: HTMLElement[] = [];
  if (el.matches(BLOCK_SELECTOR)) {
    blocks.push(el);
  }
  el.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach(b => blocks.push(b));

  let blockIndex = 1;
  for (const block of blocks) {
    if (isInCodeNode(block)) continue;

    const rawText = (block.textContent ?? "").trim();
    if (!rawText) continue;

    // Synthesize markdown prefix for rendered block elements so rules like `if line[0] == ">":` or `if line[:2] == "- ":` match in Reading View
    let virtualLine = rawText;
    const tag = block.tagName.toLowerCase();
    if (tag === "blockquote" && !virtualLine.startsWith(">")) {
      virtualLine = "> " + virtualLine;
    } else if (tag === "li" && !/^[-*+] /.test(virtualLine) && !/^\d+\. /.test(virtualLine)) {
      virtualLine = "- " + virtualLine;
    } else if (/^h[1-6]$/.test(tag) && !virtualLine.startsWith("#")) {
      const level = Number(tag.slice(1)) || 1;
      virtualLine = "#".repeat(level) + " " + virtualLine;
    }

    const prefixAddedLen = virtualLine.length - rawText.length;
    const wordTokens = getLineTokens(virtualLine);
    const evalResult = evaluateCommands(compiledCommands, {
      line: virtualLine,
      rawLine: virtualLine,
      wordTokens,
      words: wordTokens.map(w => w.text),
      line_num: blockIndex++,
      mode: "line"
    });

    if (evalResult.lineStyles.size > 0) {
      const resolved = resolveMultipleStyles(evalResult.lineStyles, rules, fontRules, options);
      for (const cls of resolved.className.split(/\s+/)) {
        if (cls) block.classList.add(cls);
      }
      if (resolved.styleStr) {
        const existingStyle = block.getAttribute("style") || "";
        block.setAttribute("style", existingStyle + (existingStyle && !existingStyle.endsWith(";") ? ";" : "") + resolved.styleStr);
      }
    }

    if (evalResult.sliceStyles.length > 0) {
      const adjustedSlices: SliceDecorationSpec[] = [];
      for (const s of evalResult.sliceStyles) {
        const from = Math.max(0, s.fromOffset - prefixAddedLen);
        const to = Math.max(from, s.toOffset - prefixAddedLen);
        if (to > from) {
          adjustedSlices.push({ fromOffset: from, toOffset: to, styles: s.styles });
        }
      }
      if (adjustedSlices.length > 0) {
        applySliceStylesToElement(block, adjustedSlices, rules, fontRules, options);
      }
    }
  }
}

function applySliceStylesToElement(
  blockEl: HTMLElement,
  slices: SliceDecorationSpec[],
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  options: ReactiveFeatureOptions
) {
  const doc = blockEl.ownerDocument;
  const textNodes: { node: Text; start: number; end: number }[] = [];
  let offset = 0;

  const walker = doc.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) {
        return NodeFilter.FILTER_REJECT;
      }
      if (isInCodeNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const tNode = walker.currentNode as Text;
    const len = (tNode.nodeValue ?? "").length;
    textNodes.push({ node: tNode, start: offset, end: offset + len });
    offset += len;
  }

  for (const item of textNodes) {
    const overlapping = slices
      .filter(s => s.fromOffset < item.end && s.toOffset > item.start)
      .sort((a, b) => a.fromOffset - b.fromOffset);

    if (overlapping.length === 0) continue;

    const textVal = item.node.nodeValue ?? "";
    const frag = doc.createDocumentFragment();
    let localPos = 0;

    for (const s of overlapping) {
      const relStart = Math.max(localPos, s.fromOffset - item.start);
      const relEnd = Math.min(textVal.length, s.toOffset - item.start);
      if (relEnd <= relStart) continue;

      if (relStart > localPos) {
        frag.appendChild(doc.createTextNode(textVal.slice(localPos, relStart)));
      }

      const resolved = resolveMultipleStyles(s.styles, rules, fontRules, options);
      const span = createSpan({ cls: `concrete-slice-style ${resolved.className}`.trim() });
      if (resolved.styleStr) {
        span.setAttribute("style", resolved.styleStr);
      }
      span.textContent = textVal.slice(relStart, relEnd);
      frag.appendChild(span);

      localPos = relEnd;
    }

    if (localPos < textVal.length) {
      frag.appendChild(doc.createTextNode(textVal.slice(localPos)));
    }

    item.node.replaceWith(frag);
  }
}

function applyInlineSubstitutions(
  el: HTMLElement,
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  commands: CommandRule[],
  compiledCommands: ProgramNode,
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
    const fragment = renderTextNode(textVal, wrappers, rules, fontRules, commands, compiledCommands, options, el.ownerDocument);
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
  compiledCommands: ProgramNode,
  options: ReactiveFeatureOptions,
  doc: Document = activeDocument
): DocumentFragment | null {
  const matches = findWrapperMatchesInText(text, 0, wrappers);
  if (matches.length === 0) return null;

  return buildDOMTree(text, 0, text.length, matches, rules, fontRules, commands, compiledCommands, options, doc);
}

function buildDOMTree(
  text: string,
  from: number,
  to: number,
  matches: ReturnType<typeof findWrapperMatchesInText>,
  rules: Map<string, RuleEntry>,
  fontRules: Map<string, FontRuleEntry>,
  commands: CommandRule[],
  compiledCommands: ProgramNode,
  options: ReactiveFeatureOptions,
  doc: Document = activeDocument
): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  let index = from;
  const chainCmds = commands.filter((c): c is ChainCommand => c.type === "chain");
  const hasCompiledCommands = compiledCommands.body.length > 0;

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
    let inlineStyleStr = "";

    for (const style of getEnabledStyles(nextMatch.rule, options)) {
      if (style.section === "colors" || isColorString(style.val)) {
        inlineStyleStr += `color: ${style.val};`;
      } else if (style.val.startsWith("font:")) {
        const fName = style.val.slice(5);
        const fRule = fontRules.get(fName);
        if (fRule && options.enableTextVariables) {
          inlineStyleStr += `font-family: ${fRule.cssValue};`;
        }
      } else {
        span.classList.add(`rv-${style.val}`);
        const textSizeCssVar = getTextSizeCssVar(style.val, rules, options);
        if (textSizeCssVar) {
          inlineStyleStr += `font-size: var(${textSizeCssVar});`;
        }
      }
    }

    // Follow chained styles from compiledCommands or legacy chainCmds
    const spanInnerText = text.slice(nextMatch.contentFrom, nextMatch.contentTo);
    if (hasCompiledCommands) {
      const cascadedStyles = evaluateSpanStyles(
        compiledCommands,
        [nextMatch.rule.key],
        spanInnerText,
        text
      );
      for (const cStyle of cascadedStyles) {
        if (cStyle !== nextMatch.rule.key) {
          const resolved = resolveMultipleStyles([cStyle], rules, fontRules, options);
          for (const cls of resolved.className.split(/\s+/)) {
            if (cls) span.classList.add(cls);
          }
          if (resolved.styleStr) {
            inlineStyleStr += resolved.styleStr;
          }
        }
      }
    } else if (chainCmds.length > 0) {
      const chained = resolveChainedStyles([nextMatch.rule.key], chainCmds);
      for (const cStyle of chained) {
        if (cStyle !== nextMatch.rule.key) {
          const resolved = resolveMultipleStyles([cStyle], rules, fontRules, options);
          for (const cls of resolved.className.split(/\s+/)) {
            if (cls) span.classList.add(cls);
          }
          if (resolved.styleStr) {
            inlineStyleStr += resolved.styleStr;
          }
        }
      }
    }

    if (inlineStyleStr) {
      span.setAttribute("style", inlineStyleStr);
    }

    const innerContent = buildDOMTree(
      text,
      nextMatch.contentFrom,
      nextMatch.contentTo,
      innerMatches,
      rules,
      fontRules,
      commands,
      compiledCommands,
      options,
      doc
    );
    span.appendChild(innerContent);
    fragment.appendChild(span);

    index = nextMatch.fullTo;
  }

  return fragment;
}

function isInCodeNode(node: Node): boolean {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
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
    if (el.classList.contains("rv-styled") && !el.matches(BLOCK_SELECTOR)) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}
