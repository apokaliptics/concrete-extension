import { Text } from "@codemirror/state";

export type DeclSource = "frontmatter" | "vars-block";

export interface DeclBlockRange {
  from: number;
  to: number;
  source: DeclSource;
}

export type RuleType = "css" | "wrapper";

export interface RuleEntry {
  key: string;
  val: string;
  type: RuleType;
  startSym?: string;
  endSym?: string;
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

  for (let lineNo = startLine + 1; lineNo <= endLine - 1; lineNo += 1) {
    const text = doc.line(lineNo).text.trim();
    if (!text || text.startsWith("#")) continue;

    const match = /^(.+?)\s*=\s*(.+)$/.exec(text);
    if (!match || !match[1] || !match[2]) continue;

    const key = match[1].trim();
    const val = match[2].trim();

    if (/^[A-Za-z0-9_-]+$/.test(key)) {
      rules.set(key, { key, val, type: "css" });
    } else {
      let startSym = key;
      let endSym = key;
      if (key.length === 2 && key.charAt(0) !== key.charAt(1)) {
        startSym = key.charAt(0);
        endSym = key.charAt(1);
      }
      rules.set(key, { key, val, type: "wrapper", startSym, endSym });
    }
  }
}

function findDeclarationBlocks(doc: Text): DeclBlockRange[] {
  const blocks: DeclBlockRange[] = [];
  const firstLine = doc.line(1).text.trim();
  if (firstLine === "---") {
    for (let lineNo = 2; lineNo <= doc.lines; lineNo += 1) {
      const lineText = doc.line(lineNo).text.trim();
      if (lineText === "---" || lineText === "...") {
        blocks.push({
          from: doc.line(1).from,
          to: doc.line(lineNo).to,
          source: "frontmatter"
        });
        break;
      }
    }
  }

  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const lineText = doc.line(lineNo).text.trim();
    if (lineText === ":::vars") {
      for (let endLine = lineNo + 1; endLine <= doc.lines; endLine += 1) {
        const endText = doc.line(endLine).text.trim();
        if (endText === ":::") {
          blocks.push({
            from: doc.line(lineNo).from,
            to: doc.line(endLine).to,
            source: "vars-block"
          });
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
         /^hsla?\([^)]+\)$/i.test(val) ||
         /^[A-Za-z]+$/.test(val);
}
