import { Text } from "@codemirror/state";
import { create, all } from "mathjs";

export const VAR_NAME_REGEX = /[A-Za-z_][A-Za-z0-9_]*/;
export const VAR_REF_REGEX = /@([A-Za-z_][A-Za-z0-9_]*)/g;

const DECL_REGEX = /^(const\s+)?@([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*(.+)$/;

const COLOR_HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_RGB = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/i;
const COLOR_HSL = /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)$/i;

const NUMBER_REGEX = /^[+-]?\d+(?:\.\d+)?$/;

if (!all) {
  throw new Error("mathjs factory bundle unavailable");
}
const math = create(all, {});
math.import(
  {
    import: () => {
      throw new Error("import disabled");
    },
    createUnit: () => {
      throw new Error("createUnit disabled");
    }
  },
  { override: true }
);

export type DeclSource = "frontmatter" | "vars-block";

export interface DeclBlockRange {
  from: number;
  to: number;
  source: DeclSource;
}

export interface RawDecl {
  name: string;
  raw: string;
  isConst: boolean;
  source: DeclSource;
  from: number;
  to: number;
  line: number;
  text: string;
}

export type VarType = "color" | "number" | "string" | "error" | "unknown";

export interface ResolvedVar {
  name: string;
  val: string | number;
  type: VarType;
  raw: string;
  deps: string[];
  error?: string;
}

export interface VarEntry {
  val: string | number;
  type: VarType;
  refs: number;
}

export interface VarError {
  message: string;
  from: number;
  to: number;
}

export interface ParseResult {
  decls: Map<string, RawDecl>;
  blocks: DeclBlockRange[];
  errors: VarError[];
}

export function parseDeclarations(doc: Text): ParseResult {
  const blocks = findDeclarationBlocks(doc);
  const decls = new Map<string, RawDecl>();
  const errors: VarError[] = [];

  for (const block of blocks.filter((b) => b.source === "frontmatter")) {
    parseBlock(doc, block, decls, errors, false);
  }

  for (const block of blocks.filter((b) => b.source === "vars-block")) {
    parseBlock(doc, block, decls, errors, false);
  }

  return { decls, blocks, errors };
}

export function resolveDeclarations(decls: Map<string, RawDecl>): {
  resolved: Map<string, ResolvedVar>;
  errors: VarError[];
} {
  const resolved = new Map<string, ResolvedVar>();
  const errors: VarError[] = [];
  const resolving = new Set<string>();

  const pushError = (decl: RawDecl, message: string) => {
    errors.push({ message, from: decl.from, to: decl.to });
  };

  const resolveVar = (name: string): ResolvedVar => {
    const cached = resolved.get(name);
    if (cached) {
      return cached;
    }

    const decl = decls.get(name);
    if (!decl) {
      return {
        name,
        val: "",
        type: "error",
        raw: "",
        deps: [],
        error: `Undefined variable @${name}`
      };
    }

    if (resolving.has(name)) {
      const message = `Circular reference detected for @${name}`;
      const res: ResolvedVar = {
        name,
        val: decl.raw,
        type: "error",
        raw: decl.raw,
        deps: [],
        error: message
      };
      pushError(decl, message);
      resolved.set(name, res);
      return res;
    }

    resolving.add(name);

    const raw = decl.raw.trim();
    let res: ResolvedVar;

    if (isQuoted(raw)) {
      res = {
        name,
        val: stripQuotes(raw),
        type: "string",
        raw,
        deps: []
      };
    } else if (isColorString(raw)) {
      res = {
        name,
        val: raw,
        type: "color",
        raw,
        deps: []
      };
    } else if (isNumberString(raw)) {
      res = {
        name,
        val: Number(raw),
        type: "number",
        raw,
        deps: []
      };
    } else if (matchesSingleVar(raw)) {
      const refName = raw.slice(1);
      if (!decls.has(refName)) {
        const message = `Undefined variable @${refName}`;
        res = {
          name,
          val: raw,
          type: "error",
          raw,
          deps: [refName],
          error: message
        };
        pushError(decl, message);
      } else {
        const ref = resolveVar(refName);
        if (ref.type === "error") {
          res = {
            name,
            val: raw,
            type: "error",
            raw,
            deps: [refName],
            error: ref.error
          };
        } else {
          res = {
            name,
            val: ref.val,
            type: ref.type,
            raw,
            deps: [refName]
          };
        }
      }
    } else {
      const refs = extractVarRefs(raw);
      const uniqueRefs = Array.from(new Set(refs));
      const scope: Record<string, string | number> = {};
      let hasError = false;

      for (const refName of uniqueRefs) {
        if (!decls.has(refName)) {
          const message = `Undefined variable @${refName}`;
          pushError(decl, message);
          hasError = true;
          continue;
        }

        const ref = resolveVar(refName);
        if (ref.type === "error") {
          hasError = true;
          continue;
        }

        if (ref.type === "number" || ref.type === "string") {
          scope[refName] = ref.val;
        } else {
          const message = `Invalid dependency @${refName} for expression in @${name}`;
          pushError(decl, message);
          hasError = true;
        }
      }

      if (hasError) {
        res = {
          name,
          val: raw,
          type: "error",
          raw,
          deps: uniqueRefs,
          error: `Unresolved expression for @${name}`
        };
      } else {
        const expr = raw.replace(VAR_REF_REGEX, (_, refName) => refName);
        try {
          const out: unknown = math.evaluate(expr, scope);
          if (typeof out === "number") {
            res = {
              name,
              val: out,
              type: "number",
              raw,
              deps: uniqueRefs
            };
          } else if (typeof out === "string") {
            res = {
              name,
              val: out,
              type: "string",
              raw,
              deps: uniqueRefs
            };
          } else {
            res = {
              name,
              val: String(out),
              type: "unknown",
              raw,
              deps: uniqueRefs
            };
          }
        } catch {
          const message = `Invalid expression for @${name}`;
          pushError(decl, message);
          res = {
            name,
            val: raw,
            type: "error",
            raw,
            deps: uniqueRefs,
            error: message
          };
        }
      }
    }

    resolving.delete(name);
    resolved.set(name, res);
    return res;
  };

  for (const name of decls.keys()) {
    resolveVar(name);
  }

  return { resolved, errors };
}

export function buildVarsMap(
  resolved: Map<string, ResolvedVar>,
  refCounts: Map<string, number>
): Map<string, VarEntry> {
  const vars = new Map<string, VarEntry>();
  for (const [name, entry] of resolved) {
    vars.set(name, {
      val: entry.val,
      type: entry.type,
      refs: refCounts.get(name) ?? 0
    });
  }
  return vars;
}

export function extractVarRefs(raw: string): string[] {
  const refs: string[] = [];
  const regex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    const name = match[1];
    if (name != null) {
      refs.push(name);
    }
  }
  return refs;
}

export function isColorString(raw: string): boolean {
  return COLOR_HEX.test(raw) || COLOR_RGB.test(raw) || COLOR_HSL.test(raw);
}

export function isNumberString(raw: string): boolean {
  return NUMBER_REGEX.test(raw);
}

function isQuoted(raw: string): boolean {
  return /^(['"]).*\1$/.test(raw);
}

function stripQuotes(raw: string): string {
  return raw.slice(1, -1);
}

function matchesSingleVar(raw: string): boolean {
  return new RegExp(`^@${VAR_NAME_REGEX.source}$`).test(raw);
}

function parseBlock(
  doc: Text,
  block: DeclBlockRange,
  decls: Map<string, RawDecl>,
  errors: VarError[],
  allowOverride: boolean
) {
  const startLine = doc.lineAt(block.from).number;
  const endLine = doc.lineAt(block.to).number;

  for (let lineNo = startLine + 1; lineNo <= endLine - 1; lineNo += 1) {
    const line = doc.line(lineNo);
    const trimmed = line.text.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = DECL_REGEX.exec(trimmed);
    if (!match) {
      continue;
    }

    const name = match[2];
    const rawValue = match[3];
    if (name == null || rawValue == null) {
      continue;
    }
    const raw = rawValue.trim();
    if (!raw) {
      errors.push({
        message: `Missing value for @${name}`,
        from: line.from,
        to: line.to
      });
      continue;
    }

    if (!allowOverride && decls.has(name)) {
      continue;
    }

    decls.set(name, {
      name,
      raw,
      isConst: Boolean(match[1]),
      source: block.source,
      from: line.from,
      to: line.to,
      line: lineNo,
      text: line.text
    });
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
