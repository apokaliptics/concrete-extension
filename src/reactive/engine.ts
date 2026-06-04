import { Text } from "@codemirror/state";

export type DeclSource = "frontmatter" | "vars-block";

export interface DeclBlockRange {
  from: number;
  to: number;
  source: DeclSource;
}

export type RuleType = "css" | "wrapper";

export interface RuleStyle {
  val: string;
  section: "colors" | "text" | "default" | "notes";
  valFrom: number;
  valTo: number;
}

export interface RuleEntry {
  key: string;
  type: RuleType;
  isLetterWrapper: boolean;
  startSym?: string;
  endSym?: string;
  styles: RuleStyle[];
}

export interface WrapperMatch {
  rule: RuleEntry;
  fullFrom: number;
  fullTo: number;
  contentFrom: number;
  contentTo: number;
}

export interface ParseResult {
  rules: Map<string, RuleEntry>;
  blocks: DeclBlockRange[];
}

interface MathRange {
  from: number;
  to: number;
}

export function findMathRanges(text: string): MathRange[] {
  const ranges: MathRange[] = [];
  
  // 1. Find block math $$...$$
  const blockRegex = /\$\$(.*?)\$\$/g;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }
  
  // 2. Find inline math $...$
  const inlineRegex = /\$([^$]+)\$/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const overlaps = ranges.some(r => start >= r.from && end <= r.to);
    if (!overlaps) {
      ranges.push({ from: start, to: end });
    }
  }
  
  return ranges;
}

export function parseGlobalVars(globalVarsStr: string, rules: Map<string, RuleEntry>) {
  if (!globalVarsStr) return;
  const lines = globalVarsStr.split("\n");
  let currentSection: "colors" | "text" | "default" | "notes" = "default";

  for (let i = 0; i < lines.length; i++) {
    const text = (lines[i] || "").trim();
    if (!text) continue;

    if (text.startsWith("##")) {
      const sectionName = text.slice(2).trim().toLowerCase();
      if (sectionName === "colors" || sectionName === "colour" || sectionName === "colours") {
        currentSection = "colors";
      } else if (sectionName === "text") {
        currentSection = "text";
      }
      continue;
    }

    if (text.toLowerCase().startsWith("#notes")) {
      currentSection = "notes";
      continue;
    }

    if (text.startsWith("#")) continue;

    const equalsIdx = text.indexOf("=");
    if (equalsIdx === -1) continue;

    const key = text.slice(0, equalsIdx).trim();
    const valRaw = text.slice(equalsIdx + 1);
    const val = valRaw.trim();
    if (!key || !val) continue;

    // For global variables, we don't have document offsets (valFrom / valTo) for widgets, so we can set them to -1.
    const style: RuleStyle = { val, section: currentSection, valFrom: -1, valTo: -1 };

    if (currentSection === "notes") {
      addCssRule(rules, key, style);
    } else if (currentSection === "text" && isTextNameToWrapperRule(key, val)) {
      addWrapperRule(rules, val, { ...style, val: key });
    } else if (isCssRuleKey(key)) {
      addCssRule(rules, key, style);
    } else {
      addWrapperRule(rules, key, style);
    }
  }
}

export function parseDeclarations(doc: Text, globalVarsStr?: string): ParseResult {
  const rules = new Map<string, RuleEntry>();
  
  if (globalVarsStr) {
    parseGlobalVars(globalVarsStr, rules);
  }

  const blocks = findDeclarationBlocks(doc);

  for (const block of blocks) {
    parseBlock(doc, block, rules);
  }

  return { rules, blocks };
}

function parseBlock(doc: Text, block: DeclBlockRange, rules: Map<string, RuleEntry>) {
  const startLine = doc.lineAt(block.from).number;
  const endLine = doc.lineAt(block.to).number;
  let currentSection: "colors" | "text" | "default" | "notes" = "default";

  for (let lineNo = startLine + 1; lineNo <= endLine - 1; lineNo += 1) {
    const text = doc.line(lineNo).text.trim();
    if (!text) continue;

    if (text.startsWith("##")) {
      const sectionName = text.slice(2).trim().toLowerCase();
      if (sectionName === "colors" || sectionName === "colour" || sectionName === "colours") {
        currentSection = "colors";
      } else if (sectionName === "text") {
        currentSection = "text";
      }
      continue;
    }

    if (text.toLowerCase().startsWith("#notes")) {
      currentSection = "notes";
      continue;
    }

    if (text.startsWith("#")) continue;

    const equalsIdx = text.indexOf("=");
    if (equalsIdx === -1) continue;

    const key = text.slice(0, equalsIdx).trim();
    const valRaw = text.slice(equalsIdx + 1);
    const val = valRaw.trim();
    if (!key || !val) continue;

    const valStart = doc.line(lineNo).from + equalsIdx + 1 + valRaw.indexOf(val);
    const valEnd = valStart + val.length;

    const style: RuleStyle = { val, section: currentSection, valFrom: valStart, valTo: valEnd };

    if (currentSection === "notes") {
      addCssRule(rules, key, style);
    } else if (currentSection === "text" && isTextNameToWrapperRule(key, val)) {
      addWrapperRule(rules, val, { ...style, val: key });
    } else if (isCssRuleKey(key)) {
      addCssRule(rules, key, style);
    } else {
      addWrapperRule(rules, key, style);
    }
  }
}

function addCssRule(rules: Map<string, RuleEntry>, key: string, style: RuleStyle) {
  if (!rules.has(key)) {
    rules.set(key, { key, type: "css", isLetterWrapper: false, styles: [] });
  }
  const entry = rules.get(key)!;
  if (style.valFrom !== -1) {
    const globalStyleIdx = entry.styles.findIndex(s => s.valFrom === -1);
    if (globalStyleIdx !== -1) {
      entry.styles[globalStyleIdx] = style;
      return;
    }
  }
  entry.styles.push(style);
}

function addWrapperRule(rules: Map<string, RuleEntry>, key: string, style: RuleStyle) {
  let startSym = key;
  let endSym = key;
  const isLetterWrapper = /^[A-Za-z]{2,}$/.test(key);
  if (!isLetterWrapper && key.length === 2) {
    startSym = key.charAt(0);
    endSym = key.charAt(1);
  }
  if (!rules.has(key)) {
    rules.set(key, { key, type: "wrapper", isLetterWrapper, startSym, endSym, styles: [] });
  }
  const entry = rules.get(key)!;
  if (style.valFrom !== -1) {
    const globalStyleIdx = entry.styles.findIndex(s => s.valFrom === -1 && s.section === style.section);
    if (globalStyleIdx !== -1) {
      entry.styles[globalStyleIdx] = style;
      return;
    }
  }
  entry.styles.push(style);
}

function isCssRuleKey(key: string): boolean {
  if (/^\d+$/.test(key)) return true;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key)) return false;
  return key.length !== 2;
}

function isTextNameToWrapperRule(key: string, val: string): boolean {
  return !isTextSizeRuleKey(key) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(key) && isWrapperKey(val);
}

function isTextSizeRuleKey(key: string): boolean {
  return /^text_[A-Za-z0-9_-]+_size$/i.test(key) || /^[A-Za-z0-9_-]+_size$/i.test(key);
}

function isWrapperKey(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  return !/^[A-Za-z0-9]{3,}$/.test(value);
}

export function findWrapperMatchesInText(text: string, lineFrom: number, wrappers: RuleEntry[]): WrapperMatch[] {
  const results: WrapperMatch[] = [];
  const usedDelimiters: Array<[number, number]> = [];
  const mathRanges = findMathRanges(text);

  const sortedWrappers = [...wrappers].sort((a, b) => (b.startSym?.length || 0) - (a.startSym?.length || 0));

  for (const rule of sortedWrappers) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const match = rule.isLetterWrapper
        ? findLetterMatch(text, searchFrom, rule)
        : findSymbolMatch(text, searchFrom, rule);

      if (!match) break;

      const isInsideMath = mathRanges.some(r => 
        (match.startIdx >= r.from && match.startIdx < r.to) ||
        (match.endIdx > r.from && match.endIdx <= r.to)
      );

      if (isInsideMath) {
        searchFrom = match.startIdx + 1;
        continue;
      }
      
      const startDelim: [number, number] = [match.startIdx, match.contentStart];
      const endDelim: [number, number] = [match.contentEnd, match.endIdx];
      
      const overlaps = usedDelimiters.some(([a, b]) => 
        (startDelim[0] < b && startDelim[1] > a) || 
        (endDelim[0] < b && endDelim[1] > a)
      );

      if (overlaps) {
        searchFrom = match.startIdx + 1;
        continue;
      }
      
      usedDelimiters.push(startDelim, endDelim);
      results.push({
        rule,
        fullFrom: lineFrom + match.startIdx,
        fullTo: lineFrom + match.endIdx,
        contentFrom: lineFrom + match.contentStart,
        contentTo: lineFrom + match.contentEnd
      });
      searchFrom = match.endIdx;
    }
  }

  results.sort((a, b) => a.fullFrom - b.fullFrom);
  return results;
}

function findSymbolMatch(text: string, from: number, rule: RuleEntry) {
  const startSym = rule.startSym!;
  const endSym = rule.endSym!;
  const startIdx = text.indexOf(startSym, from);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startSym.length;
  const endIdx = text.indexOf(endSym, contentStart);
  if (endIdx === -1) return null;
  return { startIdx, endIdx: endIdx + endSym.length, contentStart, contentEnd: endIdx };
}

function findLetterMatch(text: string, from: number, rule: RuleEntry) {
  const key = rule.key;
  let pos = from;
  while (pos < text.length) {
    const startIdx = text.indexOf(key, pos);
    if (startIdx === -1) return null;

    if (startIdx > 0 && text.charAt(startIdx - 1) !== " ") { pos = startIdx + 1; continue; }
    const afterKey = startIdx + key.length;
    if (afterKey >= text.length || text.charAt(afterKey) !== " ") { pos = startIdx + 1; continue; }

    const contentStart = afterKey + 1;
    const endMarker = " " + key;
    const endIdx = text.indexOf(endMarker, contentStart);
    if (endIdx === -1) return null;

    const fullEnd = endIdx + endMarker.length;
    if (fullEnd < text.length && text.charAt(fullEnd) !== " ") { pos = startIdx + 1; continue; }

    return { startIdx, endIdx: fullEnd, contentStart, contentEnd: endIdx };
  }
  return null;
}

function findDeclarationBlocks(doc: Text): DeclBlockRange[] {
  const blocks: DeclBlockRange[] = [];
  const firstLine = doc.line(1).text.trim();
  if (firstLine === "---") {
    for (let lineNo = 2; lineNo <= doc.lines; lineNo += 1) {
      const lineText = doc.line(lineNo).text.trim();
      if (lineText === "---" || lineText === "...") {
        blocks.push({ from: doc.line(1).from, to: doc.line(lineNo).to, source: "frontmatter" });
        break;
      }
    }
  }

  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const lineText = doc.line(lineNo).text.trim();
    if (lineText === ":::vars") {
      for (let endLine = lineNo + 1; endLine <= doc.lines; endLine += 1) {
        if (doc.line(endLine).text.trim() === ":::") {
          blocks.push({ from: doc.line(lineNo).from, to: doc.line(endLine).to, source: "vars-block" });
          lineNo = endLine;
          break;
        }
      }
    }
  }

  return blocks;
}

export function isColorString(val: string): boolean {
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val) ||
         /^rgba?\([^)]+\)$/i.test(val) ||
         /^hsla?\([^)]+\)$/i.test(val);
}

export function containsImageMarkdown(text: string): boolean {
  return /!\[\[.*?\]\]|!\[.*?\]\(.*?\)/.test(text);
}

export function stripVariables(text: string): string {
  const lines = text.split("\n");
  const cleanLines: string[] = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (trimmed === ":::vars") {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (trimmed === ":::") {
        inBlock = false;
      }
      continue;
    }
    cleanLines.push(line);
  }
  return cleanLines.join("\n");
}
