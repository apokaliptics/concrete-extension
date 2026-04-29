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
  section: "colors" | "text" | "default";
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

export function parseDeclarations(doc: Text): ParseResult {
  const blocks = findDeclarationBlocks(doc);
  const rules = new Map<string, RuleEntry>();

  for (const block of blocks) {
    parseBlock(doc, block, rules);
  }

  return { rules, blocks };
}

function parseBlock(doc: Text, block: DeclBlockRange, rules: Map<string, RuleEntry>) {
  const startLine = doc.lineAt(block.from).number;
  const endLine = doc.lineAt(block.to).number;
  let currentSection: "colors" | "text" | "default" = "default";

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

    if (/[_-]/.test(key) || /^\d+$/.test(key) || (/^[A-Za-z0-9]+$/.test(key) && key.length !== 2)) {
      if (!rules.has(key)) rules.set(key, { key, type: "css", isLetterWrapper: false, styles: [] });
      rules.get(key)!.styles.push(style);
    } else if (/^[A-Za-z]{2,}$/.test(key)) {
      if (!rules.has(key)) rules.set(key, { key, type: "wrapper", isLetterWrapper: true, startSym: key, endSym: key, styles: [] });
      rules.get(key)!.styles.push(style);
    } else {
      let startSym = key;
      let endSym = key;
      if (key.length === 2) {
        startSym = key.charAt(0);
        endSym = key.charAt(1);
      }
      if (!rules.has(key)) rules.set(key, { key, type: "wrapper", isLetterWrapper: false, startSym, endSym, styles: [] });
      rules.get(key)!.styles.push(style);
    }
  }
}

export function findWrapperMatchesInText(text: string, lineFrom: number, wrappers: RuleEntry[]): WrapperMatch[] {
  const results: WrapperMatch[] = [];
  const usedDelimiters: Array<[number, number]> = [];

  const sortedWrappers = [...wrappers].sort((a, b) => (b.startSym?.length || 0) - (a.startSym?.length || 0));

  for (const rule of sortedWrappers) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const match = rule.isLetterWrapper
        ? findLetterMatch(text, searchFrom, rule)
        : findSymbolMatch(text, searchFrom, rule);

      if (!match) break;
      
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

export function parseDashLevel(lineText: string): number {
  const match = /^(-{1,6})\s+\S/.exec(lineText);
  if (!match || !match[1]) return 0;
  return match[1].length;
}
