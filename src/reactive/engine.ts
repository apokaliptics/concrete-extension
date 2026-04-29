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
  section: "colors" | "text" | "default";
  startSym?: string;
  endSym?: string;
  valFrom: number;
  valTo: number;
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
    if (!text || text.startsWith("#")) continue;

    const lower = text.toLowerCase();
    if (lower === "colors" || lower === "colour" || lower === "colours") {
      currentSection = "colors";
      continue;
    }
    if (lower === "text") {
      currentSection = "text";
      continue;
    }

    const equalsIdx = text.indexOf("=");
    if (equalsIdx === -1) continue;

    const keyRaw = text.slice(0, equalsIdx);
    const valRaw = text.slice(equalsIdx + 1);

    const key = keyRaw.trim();
    const val = valRaw.trim();
    
    if (!key || !val) continue;

    const valStart = doc.line(lineNo).from + equalsIdx + 1 + valRaw.indexOf(val);
    const valEnd = valStart + val.length;

    if (/^[A-Za-z0-9_-]+$/.test(key)) {
      rules.set(key, { key, val, type: "css", section: currentSection, valFrom: valStart, valTo: valEnd });
    } else {
      let startSym = key;
      let endSym = key;
      if (key.length === 2) {
        startSym = key.charAt(0);
        endSym = key.charAt(1);
      }
      rules.set(key, { key, val, type: "wrapper", section: currentSection, startSym, endSym, valFrom: valStart, valTo: valEnd });
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
         /^hsla?\([^)]+\)$/i.test(val);
}
