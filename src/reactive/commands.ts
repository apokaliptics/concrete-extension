export type CommandScope = "word" | "line";

export interface LineCommand {
  type: "line";
  scope: CommandScope;
  wordIndex?: number;
  patternRaw: string;
  patternRegex: RegExp;
  targetStyle: string;
}

export interface ChainCommand {
  type: "chain";
  sourceStyle: string;
  targetStyle: string;
}

export type CommandRule = LineCommand | ChainCommand;

export interface LineTokenMatch {
  from: number;
  to: number;
  text: string;
  index: number;
}

/* ── AST Node Interfaces ── */

export type ProgramNode = {
  type: "Program";
  body: StatementNode[];
};

export type StatementNode =
  | IfStatementNode
  | ForStatementNode
  | PresetAssignmentNode
  | TargetStyleAssignmentNode
  | ApplyStyleStatementNode
  | LegacyLineCommandNode;

export interface IfStatementNode {
  type: "IfStatement";
  branches: {
    condition: ExpressionNode;
    body: StatementNode[];
  }[];
  elseBody?: StatementNode[];
}

export interface ForStatementNode {
  type: "ForStatement";
  targets: string[];
  iterable: ExpressionNode;
  body: StatementNode[];
}

export interface PresetAssignmentNode {
  type: "PresetAssignment";
  name: string;
  value: ExpressionNode;
}

export interface TargetStyleAssignmentNode {
  type: "TargetStyleAssignment";
  target: SliceExprNode | IndexExprNode | IdentifierNode;
  styles: StyleRefNode[];
}

export interface ApplyStyleStatementNode {
  type: "ApplyStyleStatement";
  styles: StyleRefNode[];
}

export interface LegacyLineCommandNode {
  type: "LegacyLineCommand";
  rule: LineCommand;
}

export interface StyleRefNode {
  name: string;
  negated?: boolean;
}

export interface IdentifierNode {
  type: "Identifier";
  name: string;
}

export interface IndexExprNode {
  type: "IndexExpr";
  object: ExpressionNode;
  index: ExpressionNode;
}

export interface SliceExprNode {
  type: "SliceExpr";
  object: ExpressionNode;
  start: ExpressionNode | null;
  stop: ExpressionNode | null;
  step: ExpressionNode | null;
}

export type ExpressionNode =
  | { type: "Literal"; value: string | number | boolean }
  | { type: "TemplateString"; parts: (string | ExpressionNode)[] }
  | IdentifierNode
  | { type: "ListLiteral"; elements: ExpressionNode[] }
  | { type: "TupleLiteral"; elements: ExpressionNode[] }
  | { type: "UnaryExpr"; op: "not" | "-"; argument: ExpressionNode }
  | { type: "BinaryExpr"; op: string; left: ExpressionNode; right: ExpressionNode }
  | { type: "ChainedComparison"; operands: ExpressionNode[]; ops: string[] }
  | IndexExprNode
  | SliceExprNode
  | { type: "MemberExpr"; object: ExpressionNode; property: string }
  | { type: "CallExpr"; callee: ExpressionNode; args: ExpressionNode[] };

/* ── Lexer / Tokenizer Types ── */

export type TokenType =
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "COLON"
  | "COMMA"
  | "EOF"
  | "IF"
  | "ELIF"
  | "ELSE"
  | "FOR"
  | "IN"
  | "NOT_IN"
  | "AND"
  | "OR"
  | "NOT"
  | "TRUE"
  | "FALSE"
  | "IDENT"
  | "STRING"
  | "FSTRING"
  | "NUMBER"
  | "ASSIGN"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "LBRACK"
  | "RBRACK"
  | "DOT";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

/* ── Evaluation Output Types ── */

export interface SliceDecorationSpec {
  fromOffset: number;
  toOffset: number;
  styles: Set<string>;
}

export interface LineEvaluationResult {
  lineStyles: Set<string>;
  spanStyles: Map<string, Set<string>>;
  sliceStyles: SliceDecorationSpec[];
}

export interface CommandEvaluationContext {
  line: string;
  rawLine?: string;
  words?: string[];
  wordTokens?: LineTokenMatch[];
  span?: string;
  line_num?: number;
  initialStyles?: Iterable<string>;
  mode?: "line" | "span";
  presetsOut?: Map<string, string[]>;
}

/* ── Tokenizing Line Words ── */

export function getLineTokens(lineText: string): LineTokenMatch[] {
  const tokens: LineTokenMatch[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = regex.exec(lineText)) !== null) {
    tokens.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      index: index++
    });
  }

  return tokens;
}

/* ── Legacy Pattern & Command Support ── */

export function compilePattern(patternExpr: string): RegExp {
  const trimmed = patternExpr.trim();
  const parts = trimmed.split("+").map(p => p.trim()).filter(Boolean);

  let regexStr = "";
  for (const part of parts) {
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
      const literal = part.slice(1, -1);
      regexStr += escapeRegex(literal);
    } else {
      const lower = part.toLowerCase();
      if (lower === "number") {
        regexStr += "\\d+";
      } else if (lower === "word") {
        regexStr += "\\S+";
      } else if (lower === "alpha") {
        regexStr += "[a-zA-Z]+";
      } else if (lower === "heading" || lower === "#") {
        regexStr += "#{1,6}";
      } else if (lower === "bullet" || lower === "-") {
        regexStr += "[-*+]";
      } else if (lower === "quote" || lower === ">") {
        regexStr += ">";
      } else {
        regexStr += escapeRegex(part);
      }
    }
  }

  return new RegExp(`^${regexStr}$`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes legacy command syntax into Python-style syntax when possible.
 */
export function normalizeLegacyCommandLine(line: string): string {
  const indentMatch = /^([ \t]*)/.exec(line);
  const indent = indentMatch?.[1] ?? "";
  const trimmed = line.trim();

  if (!trimmed.startsWith("if ") && !trimmed.startsWith("if\t")) {
    return line;
  }

  const thenMatch = /\bthen\b/.exec(trimmed);
  if (!thenMatch || thenMatch.index === undefined) {
    return line;
  }

  const condPart = trimmed.slice(2, thenMatch.index).trim();
  const targetPart = trimmed.slice(thenMatch.index + 4).trim();
  if (!condPart || !targetPart) {
    return line;
  }

  // Legacy: if line 0 "A" + "B" then X -> if line[0] == "A" and line[-1] == "B": X
  const enclosedTwoMatch = /^line\s+0\s+(["'][^"']+["'])\s*\+\s*(["'][^"']+["'])$/.exec(condPart);
  if (enclosedTwoMatch && enclosedTwoMatch[1] && enclosedTwoMatch[2]) {
    const startLit = enclosedTwoMatch[1];
    const endLit = enclosedTwoMatch[2];
    const startLen = startLit.length - 2;
    const endLen = endLit.length - 2;
    const startExpr = startLen === 1 ? `line[0] == ${startLit}` : `line[:${startLen}] == ${startLit}`;
    const endExpr = endLen === 1 ? `line[-1] == ${endLit}` : `line[-${endLen}:] == ${endLit}`;
    return `${indent}if ${startExpr} and ${endExpr}: ${targetPart}`;
  }

  // Legacy: if line "A" then X -> if line.startswith("A"): X
  const linePrefixMatch = /^line\s+(["'][^"']+["'])$/.exec(condPart);
  if (linePrefixMatch && linePrefixMatch[1]) {
    return `${indent}if line.startswith(${linePrefixMatch[1]}): ${targetPart}`;
  }

  // Other legacy `if line ... then ...` with special pattern tokens (like `number`, `word`, etc.)
  // Leave as-is if it starts with `line ` and does not use Python operators `[`, `.`, `==`, `!=`, `in`
  if (
    /^line\s+/.test(condPart) &&
    !/[[\].=!<>]|\bin\b/.test(condPart)
  ) {
    return line;
  }

  // Standard `if <cond> then <target>` -> `if <cond>: <target>`
  return `${indent}if ${condPart}: ${targetPart}`;
}

export function parseCommandLine(line: string): CommandRule | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("if ") && !trimmed.startsWith("if\t")) {
    return null;
  }

  let conditionPart = "";
  let targetStyle = "";

  const thenIdx = trimmed.indexOf(" then ");
  if (thenIdx !== -1) {
    conditionPart = trimmed.slice(3, thenIdx).trim();
    targetStyle = trimmed.slice(thenIdx + 6).trim();
  } else {
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1 && !trimmed.slice(0, colonIdx).includes("[")) {
      conditionPart = trimmed.slice(3, colonIdx).trim();
      targetStyle = trimmed.slice(colonIdx + 1).trim();
    } else {
      return null;
    }
  }

  if (!conditionPart || !targetStyle) {
    return null;
  }

  if (conditionPart.startsWith("line ") || conditionPart === "line") {
    const afterLine = conditionPart.slice(5).trim();
    const matchIndexed = /^(\d+)\s+(.+)$/.exec(afterLine);

    if (matchIndexed && matchIndexed[1] !== undefined && matchIndexed[2] !== undefined) {
      const wordIndex = parseInt(matchIndexed[1], 10);
      const patternRaw = matchIndexed[2].trim();
      const patternRegex = compilePattern(patternRaw);

      const isBlockMarker = patternRaw === '">"' || patternRaw === "'>'" || patternRaw === ">";
      const scope: CommandScope = isBlockMarker ? "line" : "word";

      return {
        type: "line",
        scope,
        wordIndex,
        patternRaw,
        patternRegex,
        targetStyle
      };
    }

    const patternRaw = afterLine.trim();
    const patternRegex = compilePattern(patternRaw);
    return {
      type: "line",
      scope: "line",
      patternRaw,
      patternRegex,
      targetStyle
    };
  }

  return {
    type: "chain",
    sourceStyle: conditionPart,
    targetStyle
  };
}

export function resolveChainedStyles(
  activeStyles: string[],
  chainCommands: ChainCommand[],
  program?: ProgramNode
): string[] {
  if (program && program.body.length > 0) {
    const evalRes = evaluateCommands(program, {
      line: "",
      rawLine: "",
      words: [],
      span: "",
      line_num: 1,
      initialStyles: activeStyles,
      mode: "span"
    });
    return Array.from(evalRes.lineStyles);
  }

  const result = new Set<string>(activeStyles);
  const queue = [...activeStyles];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const cmd of chainCommands) {
      if (cmd.sourceStyle === current && !result.has(cmd.targetStyle)) {
        result.add(cmd.targetStyle);
        queue.push(cmd.targetStyle);
      }
    }
  }

  return Array.from(result);
}

/* ── Stage A: Indentation-Aware Tokenizer ── */

const KEYWORDS: Record<string, TokenType> = {
  if: "IF",
  elif: "ELIF",
  else: "ELSE",
  for: "FOR",
  in: "IN",
  and: "AND",
  or: "OR",
  not: "NOT",
  True: "TRUE",
  true: "TRUE",
  False: "FALSE",
  false: "FALSE",
  then: "COLON"
};

export function tokenizeCommands(source: string): Token[] {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");
  const tokens: Token[] = [];
  const indentStack: number[] = [0];
  let bracketDepth = 0;

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx] ?? "";
    const lineNum = lineIdx + 1;

    // Check if blank or comment line
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const lineToLex = bracketDepth === 0 ? normalizeLegacyCommandLine(rawLine) : rawLine;

    // Measure leading indentation only when not inside open brackets
    let pos = 0;
    if (bracketDepth === 0) {
      let col = 0;
      while (pos < lineToLex.length) {
        const ch = lineToLex[pos];
        if (ch === " ") {
          col += 1;
          pos++;
        } else if (ch === "\t") {
          col += 4;
          pos++;
        } else {
          break;
        }
      }

      const topIndent = indentStack[indentStack.length - 1] ?? 0;
      if (col > topIndent) {
        indentStack.push(col);
        tokens.push({ type: "INDENT", value: "", line: lineNum });
      } else if (col < topIndent) {
        while (indentStack.length > 1 && (indentStack[indentStack.length - 1] ?? 0) > col) {
          indentStack.pop();
          tokens.push({ type: "DEDENT", value: "", line: lineNum });
        }
      }
    }

    // Tokenize line content
    while (pos < lineToLex.length) {
      const ch = lineToLex[pos]!;

      if (ch === " " || ch === "\t") {
        pos++;
        continue;
      }

      // Inline comment (only when # is preceded by whitespace and not part of a style token like ##)
      if (ch === "#") {
        break;
      }

      // Check for f-string: f"..." or f'...'
      if ((ch === "f" || ch === "F") && (lineToLex[pos + 1] === '"' || lineToLex[pos + 1] === "'")) {
        const quote = lineToLex[pos + 1]!;
        pos += 2;
        let strVal = "";
        while (pos < lineToLex.length && lineToLex[pos] !== quote) {
          if (lineToLex[pos] === "\\" && pos + 1 < lineToLex.length) {
            pos++;
          }
          strVal += lineToLex[pos];
          pos++;
        }
        if (pos < lineToLex.length && lineToLex[pos] === quote) {
          pos++;
        }
        tokens.push({ type: "FSTRING", value: strVal, line: lineNum });
        continue;
      }

      // String literal
      if (ch === '"' || ch === "'") {
        const quote = ch;
        pos++;
        let strVal = "";
        while (pos < lineToLex.length && lineToLex[pos] !== quote) {
          if (lineToLex[pos] === "\\" && pos + 1 < lineToLex.length) {
            pos++;
          }
          strVal += lineToLex[pos];
          pos++;
        }
        if (pos < lineToLex.length && lineToLex[pos] === quote) {
          pos++;
        }
        tokens.push({ type: "STRING", value: strVal, line: lineNum });
        continue;
      }

      // Number literal
      if (/\d/.test(ch)) {
        let numStr = "";
        while (pos < lineToLex.length && /[\d.]/.test(lineToLex[pos]!)) {
          numStr += lineToLex[pos];
          pos++;
        }
        tokens.push({ type: "NUMBER", value: numStr, line: lineNum });
        continue;
      }

      // Two-character operators
      const twoChar = lineToLex.slice(pos, pos + 2);
      if (twoChar === "==" || twoChar === "!=" || twoChar === "<=" || twoChar === ">=") {
        tokens.push({ type: "OP", value: twoChar, line: lineNum });
        pos += 2;
        continue;
      }

      // Single-character delimiters & operators
      if (ch === ":") {
        tokens.push({ type: "COLON", value: ":", line: lineNum });
        pos++;
        continue;
      }
      if (ch === ",") {
        tokens.push({ type: "COMMA", value: ",", line: lineNum });
        pos++;
        continue;
      }
      if (ch === "=") {
        tokens.push({ type: "ASSIGN", value: "=", line: lineNum });
        pos++;
        continue;
      }
      if (ch === "(") {
        bracketDepth++;
        tokens.push({ type: "LPAREN", value: "(", line: lineNum });
        pos++;
        continue;
      }
      if (ch === ")") {
        bracketDepth = Math.max(0, bracketDepth - 1);
        tokens.push({ type: "RPAREN", value: ")", line: lineNum });
        pos++;
        continue;
      }
      if (ch === "[") {
        bracketDepth++;
        tokens.push({ type: "LBRACK", value: "[", line: lineNum });
        pos++;
        continue;
      }
      if (ch === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
        tokens.push({ type: "RBRACK", value: "]", line: lineNum });
        pos++;
        continue;
      }
      if (ch === ".") {
        tokens.push({ type: "DOT", value: ".", line: lineNum });
        pos++;
        continue;
      }
      if (ch === "<" || ch === ">" || ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
        tokens.push({ type: "OP", value: ch, line: lineNum });
        pos++;
        continue;
      }

      // Identifier or keyword (or 2-char symbol wrapper like ^^, &&)
      if (/[A-Za-z_]/.test(ch)) {
        let ident = "";
        while (pos < lineToLex.length && /[A-Za-z0-9_-]/.test(lineToLex[pos]!)) {
          // Stop if `-` is followed by whitespace or nothing, or if we are inside an expression where `-` might be subtraction
          if (lineToLex[pos] === "-") {
            // Allow hyphen in style names like `text-lg`, unless spaces surround it
            ident += lineToLex[pos];
            pos++;
          } else {
            ident += lineToLex[pos];
            pos++;
          }
        }

        const kwType = KEYWORDS[ident];
        if (kwType === "NOT") {
          // Check if followed by `in` -> `NOT_IN`
          const rest = lineToLex.slice(pos);
          const notInMatch = /^[ \t]+in\b/.exec(rest);
          if (notInMatch) {
            tokens.push({ type: "NOT_IN", value: "not in", line: lineNum });
            pos += notInMatch[0].length;
            continue;
          }
        }

        if (kwType) {
          tokens.push({ type: kwType, value: ident === "then" ? ":" : ident, line: lineNum });
        } else {
          tokens.push({ type: "IDENT", value: ident, line: lineNum });
        }
        continue;
      }

      // Symbol wrapper identifiers like ^^ or &&
      let sym = "";
      while (
        pos < lineToLex.length &&
        !/[\s:#,()[\].=!<>"'0-9A-Za-z_]/.test(lineToLex[pos]!)
      ) {
        sym += lineToLex[pos];
        pos++;
      }
      if (sym) {
        tokens.push({ type: "IDENT", value: sym, line: lineNum });
      } else {
        pos++;
      }
    }

    if (bracketDepth === 0) {
      const lastTok = tokens[tokens.length - 1];
      if (lastTok && lastTok.type !== "NEWLINE" && lastTok.type !== "INDENT" && lastTok.type !== "DEDENT") {
        tokens.push({ type: "NEWLINE", value: "\n", line: lineNum });
      }
    }
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: "DEDENT", value: "", line: rawLines.length });
  }

  tokens.push({ type: "EOF", value: "", line: rawLines.length });
  return tokens;
}

/* ── Stage B: Recursive-Descent & Pratt Parser ── */

export function parseCommands(tokens: Token[]): ProgramNode {
  let current = 0;

  function peek(offset = 0): Token {
    return tokens[current + offset] ?? { type: "EOF", value: "", line: 0 };
  }

  function advance(): Token {
    const tok = peek();
    if (tok.type !== "EOF") current++;
    return tok;
  }

  function match(...types: TokenType[]): boolean {
    if (types.includes(peek().type)) {
      advance();
      return true;
    }
    return false;
  }

  function skipNewlines(): void {
    while (peek().type === "NEWLINE") {
      advance();
    }
  }

  function skipToEndOfLine(): void {
    while (peek().type !== "NEWLINE" && peek().type !== "EOF" && peek().type !== "DEDENT") {
      advance();
    }
    if (peek().type === "NEWLINE") {
      advance();
    }
  }

  function parseProgram(): ProgramNode {
    const body: StatementNode[] = [];
    skipNewlines();
    while (peek().type !== "EOF") {
      if (peek().type === "DEDENT" || peek().type === "INDENT") {
        advance();
        continue;
      }
      const stmt = parseStatement();
      if (stmt) {
        body.push(stmt);
      }
      skipNewlines();
    }
    return { type: "Program", body };
  }

  function parseStatement(): StatementNode | null {
    skipNewlines();
    const tok = peek();

    if (tok.type === "IF") {
      return parseIfStatement();
    }

    if (tok.type === "FOR") {
      return parseForStatement();
    }

    return parseSimpleStatement();
  }

  function isUnnormalizedLegacyLineIf(): LegacyLineCommandNode | null {
    // Check if `if line <index?> <pattern> : <target>`
    const saved = current;
    if (peek().type !== "IF") return null;
    advance(); // consume IF

    if (peek().type === "IDENT" && peek().value === "line") {
      const next = peek(1);
      // If followed by NUMBER or STRING or IDENT (like `number`, `word`), and NOT `[`, `.`, `==`, `!=`, `in`, `not in`
      if (
        next.type === "NUMBER" ||
        next.type === "STRING" ||
        (next.type === "IDENT" && next.value !== "in" && next.value !== "and" && next.value !== "or")
      ) {
        let rawParts: string[] = ["if", "line"];
        advance(); // consume 'line'
        while (peek().type !== "COLON" && peek().type !== "NEWLINE" && peek().type !== "EOF") {
          const t = advance();
          if (t.type === "STRING") {
            rawParts.push(`"${t.value}"`);
          } else {
            rawParts.push(t.value);
          }
        }
        if (match("COLON")) {
          const targets: string[] = [];
          while (peek().type !== "NEWLINE" && peek().type !== "EOF" && peek().type !== "DEDENT") {
            const t = advance();
            if (t.type !== "COMMA") {
              targets.push(t.value);
            }
          }
          match("NEWLINE");
          const reconstructed = `${rawParts.join(" ")} then ${targets.join(", ")}`;
          const legacyRule = parseCommandLine(reconstructed);
          if (legacyRule && legacyRule.type === "line") {
            return { type: "LegacyLineCommand", rule: legacyRule };
          }
        }
      }
    }

    current = saved;
    return null;
  }

  function parseIfStatement(): StatementNode | null {
    const legacyNode = isUnnormalizedLegacyLineIf();
    if (legacyNode) return legacyNode;

    advance(); // consume IF
    const condition = parseExpression();
    match("COLON");
    const firstBody = parseSuite();

    const branches: { condition: ExpressionNode; body: StatementNode[] }[] = [
      { condition, body: firstBody }
    ];

    skipNewlines();
    while (peek().type === "ELIF") {
      advance(); // consume ELIF
      const elifCond = parseExpression();
      match("COLON");
      const elifBody = parseSuite();
      branches.push({ condition: elifCond, body: elifBody });
      skipNewlines();
    }

    let elseBody: StatementNode[] | undefined;
    if (peek().type === "ELSE") {
      advance(); // consume ELSE
      match("COLON");
      elseBody = parseSuite();
    }

    return {
      type: "IfStatement",
      branches,
      ...(elseBody ? { elseBody } : {})
    };
  }

  function parseForStatement(): ForStatementNode | null {
    advance(); // consume FOR
    const targets: string[] = [];

    if (peek().type === "LPAREN") {
      advance();
      while (peek().type !== "RPAREN" && peek().type !== "EOF") {
        if (peek().type === "IDENT") {
          targets.push(advance().value);
        } else {
          advance();
        }
        match("COMMA");
      }
      match("RPAREN");
    } else {
      while (peek().type !== "IN" && peek().type !== "EOF" && peek().type !== "NEWLINE") {
        if (peek().type === "IDENT") {
          targets.push(advance().value);
        } else {
          advance();
        }
        if (!match("COMMA")) break;
      }
    }

    match("IN");
    const iterable = parseExpression();
    match("COLON");
    const body = parseSuite();

    return {
      type: "ForStatement",
      targets,
      iterable,
      body
    };
  }

  function parseSuite(): StatementNode[] {
    const stmts: StatementNode[] = [];
    if (peek().type !== "NEWLINE" && peek().type !== "EOF") {
      // Single-line suite
      const s = parseSimpleStatement();
      if (s) stmts.push(s);
      return stmts;
    }

    skipNewlines();
    if (!match("INDENT")) {
      return stmts;
    }

    while (peek().type !== "DEDENT" && peek().type !== "EOF") {
      skipNewlines();
      if (peek().type === "DEDENT" || peek().type === "EOF") break;
      const s = parseStatement();
      if (s) {
        stmts.push(s);
      } else {
        skipToEndOfLine();
      }
      skipNewlines();
    }

    match("DEDENT");
    return stmts;
  }

  function parseSimpleStatement(): StatementNode | null {
    const startIdx = current;

    // Check if there is an ASSIGN `=` on this logical line
    let hasAssign = false;
    let look = current;
    while (
      tokens[look] &&
      tokens[look]!.type !== "NEWLINE" &&
      tokens[look]!.type !== "EOF" &&
      tokens[look]!.type !== "DEDENT"
    ) {
      if (tokens[look]!.type === "ASSIGN") {
        hasAssign = true;
        break;
      }
      look++;
    }

    if (hasAssign) {
      const lhs = parsePostfix();
      if (match("ASSIGN")) {
        // Check if lhs is `line[...]`, `words[...]`, or `line` / `words`
        if (lhs.type === "SliceExpr" || lhs.type === "IndexExpr") {
          const styles = parseStyleRefList();
          match("NEWLINE");
          return {
            type: "TargetStyleAssignment",
            target: lhs,
            styles
          };
        }
        if (lhs.type === "Identifier" && (lhs.name === "line" || lhs.name === "words")) {
          const styles = parseStyleRefList();
          match("NEWLINE");
          return {
            type: "TargetStyleAssignment",
            target: lhs,
            styles
          };
        }
        if (lhs.type === "Identifier") {
          const valExpr = parseExpression();
          match("NEWLINE");
          return {
            type: "PresetAssignment",
            name: lhs.name,
            value: valExpr
          };
        }
      }
      // Fallback if assignment parse didn't match cleanly
      current = startIdx;
    }

    // Parse comma-separated style applications: e.g. `ft1, rd, -bl` or `ft1.font`
    const styles = parseStyleRefList();
    match("NEWLINE");
    if (styles.length === 0) {
      skipToEndOfLine();
      return null;
    }
    return {
      type: "ApplyStyleStatement",
      styles
    };
  }

  function parseStyleRefList(): StyleRefNode[] {
    const styles: StyleRefNode[] = [];
    while (peek().type !== "NEWLINE" && peek().type !== "EOF" && peek().type !== "DEDENT") {
      let negated = false;
      if (peek().type === "OP" && peek().value === "-") {
        advance();
        negated = true;
      }

      if (peek().type === "IDENT" || peek().type === "STRING") {
        let name = advance().value;
        // Support dot property access on styles: `ft1.font` or `ft1.size`
        if (peek().type === "DOT" && peek(1).type === "IDENT") {
          advance(); // consume DOT
          const prop = advance().value;
          name = `text_${name}_${prop}`;
        }
        styles.push(negated ? { name, negated: true } : { name });
      } else if (peek().type === "OP" && peek().value === "+") {
        advance();
        continue;
      } else if (peek().type === "COMMA") {
        advance();
        continue;
      } else {
        break;
      }

      if (peek().type === "COMMA" || (peek().type === "OP" && peek().value === "+")) {
        advance();
      }
    }
    return styles;
  }

  /* ── Expression Parsing (Precedence Climbing) ── */

  function parseExpression(): ExpressionNode {
    return parseOr();
  }

  function parseOr(): ExpressionNode {
    let left = parseAnd();
    while (match("OR")) {
      const right = parseAnd();
      left = { type: "BinaryExpr", op: "or", left, right };
    }
    return left;
  }

  function parseAnd(): ExpressionNode {
    let left = parseNot();
    while (match("AND")) {
      const right = parseNot();
      left = { type: "BinaryExpr", op: "and", left, right };
    }
    return left;
  }

  function parseNot(): ExpressionNode {
    if (match("NOT")) {
      return { type: "UnaryExpr", op: "not", argument: parseNot() };
    }
    return parseComparison();
  }

  function isComparisonOp(tok: Token): boolean {
    if (tok.type === "IN" || tok.type === "NOT_IN") return true;
    if (tok.type === "OP") {
      return (
        tok.value === "==" ||
        tok.value === "!=" ||
        tok.value === "<" ||
        tok.value === ">" ||
        tok.value === "<=" ||
        tok.value === ">="
      );
    }
    return false;
  }

  function parseComparison(): ExpressionNode {
    const first = parseAdditive();
    if (!isComparisonOp(peek())) {
      return first;
    }

    const operands: ExpressionNode[] = [first];
    const ops: string[] = [];

    while (isComparisonOp(peek())) {
      const opTok = advance();
      ops.push(opTok.value);
      operands.push(parseAdditive());
    }

    if (ops.length === 1) {
      return {
        type: "BinaryExpr",
        op: ops[0]!,
        left: operands[0]!,
        right: operands[1]!
      };
    }

    return {
      type: "ChainedComparison",
      operands,
      ops
    };
  }

  function parseAdditive(): ExpressionNode {
    let left = parseMultiplicative();
    while (peek().type === "OP" && (peek().value === "+" || peek().value === "-")) {
      const op = advance().value;
      const right = parseMultiplicative();
      left = { type: "BinaryExpr", op, left, right };
    }
    return left;
  }

  function parseMultiplicative(): ExpressionNode {
    let left = parseUnary();
    while (peek().type === "OP" && (peek().value === "*" || peek().value === "/" || peek().value === "%")) {
      const op = advance().value;
      const right = parseUnary();
      left = { type: "BinaryExpr", op, left, right };
    }
    return left;
  }

  function parseUnary(): ExpressionNode {
    if (peek().type === "OP" && peek().value === "-") {
      advance();
      return { type: "UnaryExpr", op: "-", argument: parseUnary() };
    }
    return parsePostfix();
  }

  function parsePostfix(): ExpressionNode {
    let expr = parsePrimary();

    while (true) {
      if (match("LBRACK")) {
        expr = parseBracketIndexOrSlice(expr);
      } else if (match("DOT")) {
        const propTok = peek().type === "IDENT" ? advance() : { value: "" };
        expr = { type: "MemberExpr", object: expr, property: propTok.value };
      } else if (match("LPAREN")) {
        const args: ExpressionNode[] = [];
        if (peek().type !== "RPAREN") {
          do {
            if (peek().type === "RPAREN" || peek().type === "EOF") break;
            args.push(parseExpression());
          } while (match("COMMA"));
        }
        match("RPAREN");
        expr = { type: "CallExpr", callee: expr, args };
      } else {
        break;
      }
    }

    return expr;
  }

  function parseBracketIndexOrSlice(object: ExpressionNode): ExpressionNode {
    let start: ExpressionNode | null = null;
    let stop: ExpressionNode | null = null;
    let step: ExpressionNode | null = null;
    let isSlice = false;

    if (peek().type !== "COLON" && peek().type !== "RBRACK") {
      start = parseExpression();
    }

    if (match("COLON")) {
      isSlice = true;
      if (peek().type !== "COLON" && peek().type !== "RBRACK") {
        stop = parseExpression();
      }
      if (match("COLON")) {
        if (peek().type !== "RBRACK") {
          step = parseExpression();
        }
      }
    }

    match("RBRACK");

    if (isSlice) {
      return {
        type: "SliceExpr",
        object,
        start,
        stop,
        step
      };
    }

    return {
      type: "IndexExpr",
      object,
      index: start ?? { type: "Literal", value: 0 }
    };
  }

  function parsePrimary(): ExpressionNode {
    const tok = peek();

    if (tok.type === "NUMBER") {
      advance();
      return { type: "Literal", value: Number(tok.value) };
    }

    if (tok.type === "STRING") {
      advance();
      return { type: "Literal", value: tok.value };
    }

    if (tok.type === "FSTRING") {
      advance();
      return parseFString(tok.value);
    }

    if (tok.type === "TRUE") {
      advance();
      return { type: "Literal", value: true };
    }

    if (tok.type === "FALSE") {
      advance();
      return { type: "Literal", value: false };
    }

    if (tok.type === "IDENT") {
      advance();
      return { type: "Identifier", name: tok.value };
    }

    if (tok.type === "LBRACK") {
      advance();
      const elements: ExpressionNode[] = [];
      if (peek().type !== "RBRACK") {
        do {
          if (peek().type === "RBRACK" || peek().type === "EOF") break;
          elements.push(parseExpression());
        } while (match("COMMA"));
      }
      match("RBRACK");
      return { type: "ListLiteral", elements };
    }

    if (tok.type === "LPAREN") {
      advance();
      if (peek().type === "RPAREN") {
        advance();
        return { type: "TupleLiteral", elements: [] };
      }
      const first = parseExpression();
      if (match("COMMA")) {
        const elements: ExpressionNode[] = [first];
        if (peek().type !== "RPAREN") {
          do {
            if (peek().type === "RPAREN" || peek().type === "EOF") break;
            elements.push(parseExpression());
          } while (match("COMMA"));
        }
        match("RPAREN");
        return { type: "TupleLiteral", elements };
      }
      match("RPAREN");
      return first;
    }

    // Fallback: consume unknown token and return empty string literal
    advance();
    return { type: "Literal", value: "" };
  }

  function parseFString(raw: string): ExpressionNode {
    const parts: (string | ExpressionNode)[] = [];
    let idx = 0;
    let currentLiteral = "";

    while (idx < raw.length) {
      if (raw[idx] === "{") {
        if (currentLiteral) {
          parts.push(currentLiteral);
          currentLiteral = "";
        }
        const endBrace = raw.indexOf("}", idx + 1);
        if (endBrace === -1) {
          currentLiteral += raw.slice(idx);
          break;
        }
        const exprText = raw.slice(idx + 1, endBrace).trim();
        if (exprText) {
          const subTokens = tokenizeCommands(exprText);
          const subAst = parseCommands(subTokens);
          const firstStmt = subAst.body[0];
          if (firstStmt && firstStmt.type === "ApplyStyleStatement" && firstStmt.styles[0]) {
            parts.push({ type: "Identifier", name: firstStmt.styles[0].name });
          } else {
            parts.push({ type: "Identifier", name: exprText });
          }
        }
        idx = endBrace + 1;
      } else {
        currentLiteral += raw[idx];
        idx++;
      }
    }

    if (currentLiteral) {
      parts.push(currentLiteral);
    }

    return { type: "TemplateString", parts };
  }

  return parseProgram();
}

export function compileCommandsFromSource(source: string): {
  ast: ProgramNode;
  legacyRules: CommandRule[];
} {
  const tokens = tokenizeCommands(source);
  const ast = parseCommands(tokens);
  const legacyRules: CommandRule[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const rule = parseCommandLine(rawLine);
    if (rule) {
      legacyRules.push(rule);
    }
  }

  return { ast, legacyRules };
}

/* ── Stage C: Evaluator & Fixed-Point Cascade ── */

type RuntimeValue = string | number | boolean | RuntimeValue[];

export function evaluateCommands(
  program: ProgramNode,
  context: CommandEvaluationContext
): LineEvaluationResult {
  const rawLine = context.rawLine ?? context.line;
  const leadingTrimmedLine = rawLine.replace(/^[ \t]+/, "");
  const leadingOffset = rawLine.length - leadingTrimmedLine.length;
  const wordTokens = context.wordTokens ?? getLineTokens(rawLine);
  const words = context.words ?? wordTokens.map(w => w.text);
  const span = context.span ?? "";
  const lineNum = context.line_num ?? 1;
  const mode = context.mode ?? (context.span !== undefined ? "span" : "line");

  const activeStyles = new Set<string>(context.initialStyles ?? []);
  const spanStyles = new Map<string, Set<string>>();
  let sliceStyles: SliceDecorationSpec[] = [];
  const presets = context.presetsOut ?? new Map<string, string[]>();

  function resolveStyleIdentifier(name: string, env: Map<string, RuntimeValue>): string[] {
    const envVal = env.get(name);
    if (typeof envVal === "string") {
      const preset = presets.get(envVal);
      if (preset) return preset;
      return [envVal];
    }
    if (Array.isArray(envVal)) {
      return envVal.map(v => String(v));
    }
    const preset = presets.get(name);
    if (preset) return preset;
    return [name];
  }

  function applyStyleRefs(
    refs: StyleRefNode[],
    targetSet: Set<string>,
    env: Map<string, RuntimeValue>
  ) {
    for (const ref of refs) {
      const names = resolveStyleIdentifier(ref.name, env);
      for (const resolved of names) {
        if (ref.negated || resolved.startsWith("-")) {
          const clean = resolved.startsWith("-") ? resolved.slice(1) : resolved;
          targetSet.delete(clean);
        } else {
          targetSet.add(resolved);
        }
      }
    }
  }

  function clampSliceIndex(idx: number, len: number): number {
    const actual = idx < 0 ? len + idx : idx;
    return Math.max(0, Math.min(len, actual));
  }

  function evalSlice(
    targetVal: string | RuntimeValue[],
    startNode: ExpressionNode | null,
    stopNode: ExpressionNode | null,
    stepNode: ExpressionNode | null,
    env: Map<string, RuntimeValue>
  ): RuntimeValue {
    const len = targetVal.length;
    const stepRaw = stepNode ? Number(evalExpr(stepNode, env)) : 1;
    const step = Number.isNaN(stepRaw) || stepRaw === 0 ? 1 : Math.trunc(stepRaw);

    if (step === 1) {
      const startIdx = startNode !== null && startNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(startNode, env)) || 0), len)
        : 0;
      const stopIdx = stopNode !== null && stopNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(stopNode, env)) || 0), len)
        : len;
      if (stopIdx <= startIdx) {
        return typeof targetVal === "string" ? "" : [];
      }
      return targetVal.slice(startIdx, stopIdx);
    }

    const result: RuntimeValue[] = [];
    if (step > 0) {
      const startIdx = startNode !== null && startNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(startNode, env)) || 0), len)
        : 0;
      const stopIdx = stopNode !== null && stopNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(stopNode, env)) || 0), len)
        : len;
      for (let i = startIdx; i < stopIdx; i += step) {
        result.push(targetVal[i]!);
      }
    } else {
      const startIdx = startNode !== null && startNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(startNode, env)) || 0), len - 1)
        : len - 1;
      const stopIdx = stopNode !== null && stopNode !== undefined
        ? clampSliceIndex(Math.trunc(Number(evalExpr(stopNode, env)) || 0), -1)
        : -1;
      for (let i = startIdx; i > stopIdx; i += step) {
        if (i >= 0 && i < len) {
          result.push(targetVal[i]!);
        }
      }
    }

    return typeof targetVal === "string" ? result.join("") : result;
  }

  function isTruthy(val: RuntimeValue): boolean {
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0 && !Number.isNaN(val);
    if (typeof val === "string") return val.length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return false;
  }

  function compareValues(op: string, left: RuntimeValue, right: RuntimeValue): boolean {
    if (op === "==") {
      if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((v, i) => compareValues("==", v, right[i]!));
      }
      return left === right;
    }
    if (op === "!=") {
      return !compareValues("==", left, right);
    }
    if (op === "<") return (left as number | string) < (right as number | string);
    if (op === ">") return (left as number | string) > (right as number | string);
    if (op === "<=") return (left as number | string) <= (right as number | string);
    if (op === ">=") return (left as number | string) >= (right as number | string);
    if (op === "in") {
      if (typeof right === "string") {
        return right.includes(String(left));
      }
      if (Array.isArray(right)) {
        return right.some(item => compareValues("==", left, item));
      }
      return false;
    }
    if (op === "not in") {
      return !compareValues("in", left, right);
    }
    return false;
  }

  function conditionMentionsStyleOrSpan(node: ExpressionNode, env: Map<string, RuntimeValue>): boolean {
    switch (node.type) {
      case "Identifier": {
        if (node.name === "span") return true;
        if (node.name === "line" || node.name === "words" || node.name === "line_num") return false;
        if (env.has(node.name)) {
          const val = env.get(node.name);
          return typeof val === "string";
        }
        return true;
      }
      case "UnaryExpr":
        return conditionMentionsStyleOrSpan(node.argument, env);
      case "BinaryExpr":
        return conditionMentionsStyleOrSpan(node.left, env) || conditionMentionsStyleOrSpan(node.right, env);
      case "ChainedComparison":
        return node.operands.some(op => conditionMentionsStyleOrSpan(op, env));
      case "IndexExpr":
        return conditionMentionsStyleOrSpan(node.object, env) || conditionMentionsStyleOrSpan(node.index, env);
      case "SliceExpr":
        return (
          conditionMentionsStyleOrSpan(node.object, env) ||
          (node.start ? conditionMentionsStyleOrSpan(node.start, env) : false) ||
          (node.stop ? conditionMentionsStyleOrSpan(node.stop, env) : false) ||
          (node.step ? conditionMentionsStyleOrSpan(node.step, env) : false)
        );
      case "MemberExpr":
        return conditionMentionsStyleOrSpan(node.object, env);
      case "CallExpr":
        return (
          conditionMentionsStyleOrSpan(node.callee, env) ||
          node.args.some(a => conditionMentionsStyleOrSpan(a, env))
        );
      case "ListLiteral":
      case "TupleLiteral":
        return node.elements.some(e => conditionMentionsStyleOrSpan(e, env));
      default:
        return false;
    }
  }

  function evalAsCondition(node: ExpressionNode, env: Map<string, RuntimeValue>): boolean {
    if (node.type === "Identifier") {
      // Built-in context objects evaluate their truthiness
      if (node.name === "line") return leadingTrimmedLine.length > 0;
      if (node.name === "words") return words.length > 0;
      if (node.name === "span") return span.length > 0;
      if (node.name === "line_num") return lineNum > 0;

      // Loop variable bound in env
      if (env.has(node.name)) {
        const val = env.get(node.name)!;
        if (typeof val === "string") {
          return activeStyles.has(val);
        }
        return isTruthy(val);
      }

      // Preset check: true if all styles in preset are active
      const preset = presets.get(node.name);
      if (preset && preset.length > 0) {
        return preset.every(s => activeStyles.has(s));
      }

      // Style variable check: e.g. `if rd:` checks if `rd` is currently active
      return activeStyles.has(node.name);
    }

    if (node.type === "BinaryExpr" && node.op === "and") {
      return evalAsCondition(node.left, env) && evalAsCondition(node.right, env);
    }
    if (node.type === "BinaryExpr" && node.op === "or") {
      return evalAsCondition(node.left, env) || evalAsCondition(node.right, env);
    }
    if (node.type === "UnaryExpr" && node.op === "not") {
      return !evalAsCondition(node.argument, env);
    }

    return isTruthy(evalExpr(node, env));
  }

  function evalExpr(node: ExpressionNode, env: Map<string, RuntimeValue>): RuntimeValue {
    switch (node.type) {
      case "Literal":
        return node.value;

      case "TemplateString": {
        let out = "";
        for (const part of node.parts) {
          if (typeof part === "string") {
            out += part;
          } else {
            out += String(evalExpr(part, env));
          }
        }
        return out;
      }

      case "Identifier": {
        if (node.name === "line") return leadingTrimmedLine;
        if (node.name === "words") return words;
        if (node.name === "span") return span;
        if (node.name === "line_num") return lineNum;
        if (env.has(node.name)) return env.get(node.name)!;
        const preset = presets.get(node.name);
        if (preset) return preset;
        return node.name;
      }

      case "ListLiteral":
      case "TupleLiteral":
        return node.elements.map(el => evalExpr(el, env));

      case "UnaryExpr": {
        if (node.op === "not") {
          return !evalAsCondition(node.argument, env);
        }
        const val = Number(evalExpr(node.argument, env));
        return Number.isNaN(val) ? 0 : -val;
      }

      case "BinaryExpr": {
        if (node.op === "and") {
          return evalAsCondition(node.left, env) && evalAsCondition(node.right, env);
        }
        if (node.op === "or") {
          return evalAsCondition(node.left, env) || evalAsCondition(node.right, env);
        }

        const left = evalExpr(node.left, env);
        const right = evalExpr(node.right, env);

        if (
          node.op === "==" ||
          node.op === "!=" ||
          node.op === "<" ||
          node.op === ">" ||
          node.op === "<=" ||
          node.op === ">=" ||
          node.op === "in" ||
          node.op === "not in"
        ) {
          return compareValues(node.op, left, right);
        }

        if (node.op === "+") {
          if (typeof left === "number" && typeof right === "number") {
            return left + right;
          }
          if (Array.isArray(left) && Array.isArray(right)) {
            return [...left, ...right];
          }
          if (Array.isArray(left)) {
            return [...left, right];
          }
          if (Array.isArray(right)) {
            return [left, ...right];
          }
          // When used in preset assignment like `bl + ft2`, return style list if operands are identifiers
          if (node.left.type === "Identifier" || node.right.type === "Identifier") {
            return [String(left), String(right)];
          }
          return String(left) + String(right);
        }

        const lNum = Number(left) || 0;
        const rNum = Number(right) || 0;
        if (node.op === "-") return lNum - rNum;
        if (node.op === "*") return lNum * rNum;
        if (node.op === "/") return rNum !== 0 ? lNum / rNum : 0;
        if (node.op === "%") return rNum !== 0 ? lNum % rNum : 0;
        return 0;
      }

      case "ChainedComparison": {
        const evalOperands = node.operands.map(op => evalExpr(op, env));
        for (let i = 0; i < node.ops.length; i++) {
          if (!compareValues(node.ops[i]!, evalOperands[i]!, evalOperands[i + 1]!)) {
            return false;
          }
        }
        return true;
      }

      case "IndexExpr": {
        const obj = evalExpr(node.object, env);
        const idxRaw = Number(evalExpr(node.index, env));
        if (Number.isNaN(idxRaw)) return "";
        const idx = Math.trunc(idxRaw);

        if (typeof obj === "string" || Array.isArray(obj)) {
          const actualIdx = idx < 0 ? obj.length + idx : idx;
          if (actualIdx < 0 || actualIdx >= obj.length) {
            return "";
          }
          return obj[actualIdx] ?? "";
        }
        return "";
      }

      case "SliceExpr": {
        const obj = evalExpr(node.object, env);
        if (typeof obj === "string" || Array.isArray(obj)) {
          return evalSlice(obj, node.start, node.stop, node.step, env);
        }
        return "";
      }

      case "MemberExpr": {
        if (node.object.type === "Identifier" && node.object.name === "line" && node.property === "raw") {
          return rawLine;
        }
        const obj = evalExpr(node.object, env);
        if (typeof obj === "string") {
          return `text_${obj}_${node.property}`;
        }
        return "";
      }

      case "CallExpr": {
        // Built-in functions: len(x), range(start, stop, step)
        if (node.callee.type === "Identifier") {
          const fnName = node.callee.name;
          if (fnName === "len") {
            const arg = node.args[0] ? evalExpr(node.args[0], env) : "";
            if (typeof arg === "string" || Array.isArray(arg)) {
              return arg.length;
            }
            return 0;
          }
          if (fnName === "range") {
            const evalArgs = node.args.map(a => Math.trunc(Number(evalExpr(a, env)) || 0));
            let start = 0;
            let stop = 0;
            let step = 1;
            if (evalArgs.length === 1) {
              stop = evalArgs[0]!;
            } else if (evalArgs.length >= 2) {
              start = evalArgs[0]!;
              stop = evalArgs[1]!;
              if (evalArgs[2] !== undefined && evalArgs[2] !== 0) {
                step = evalArgs[2];
              }
            }
            const out: number[] = [];
            const maxIter = 256;
            if (step > 0) {
              for (let i = start; i < stop && out.length < maxIter; i += step) {
                out.push(i);
              }
            } else if (step < 0) {
              for (let i = start; i > stop && out.length < maxIter; i += step) {
                out.push(i);
              }
            }
            return out;
          }
        }

        // String methods: line.startswith, line.endswith, line.find, line.count, line.lower, line.upper, line.strip
        if (node.callee.type === "MemberExpr") {
          const targetObj = evalExpr(node.callee.object, env);
          const method = node.callee.property;
          const strTarget = String(targetObj);
          const firstArg = node.args[0] ? String(evalExpr(node.args[0], env)) : "";

          switch (method) {
            case "startswith":
              return strTarget.startsWith(firstArg);
            case "endswith":
              return strTarget.endsWith(firstArg);
            case "find":
              return strTarget.indexOf(firstArg);
            case "count": {
              if (!firstArg) return 0;
              let count = 0;
              let pos = 0;
              while ((pos = strTarget.indexOf(firstArg, pos)) !== -1) {
                count++;
                pos += firstArg.length;
              }
              return count;
            }
            case "lower":
              return strTarget.toLowerCase();
            case "upper":
              return strTarget.toUpperCase();
            case "strip":
              return firstArg
                ? strTarget.replace(new RegExp(`^[${escapeRegex(firstArg)}]+|[${escapeRegex(firstArg)}]+$`, "g"), "")
                : strTarget.trim();
          }
        }

        return "";
      }
    }
  }

  function recordTargetSliceAssignment(
    stmt: TargetStyleAssignmentNode,
    env: Map<string, RuntimeValue>
  ) {
    const resolvedStyles = new Set<string>();
    applyStyleRefs(stmt.styles, resolvedStyles, env);
    if (resolvedStyles.size === 0) return;

    const target = stmt.target;

    // Case 1: `line[i] = ...`
    if (target.type === "IndexExpr" && target.object.type === "Identifier" && target.object.name === "line") {
      const idxRaw = Math.trunc(Number(evalExpr(target.index, env)) || 0);
      const len = leadingTrimmedLine.length;
      const actualIdx = idxRaw < 0 ? len + idxRaw : idxRaw;
      if (actualIdx >= 0 && actualIdx < len) {
        sliceStyles.push({
          fromOffset: leadingOffset + actualIdx,
          toOffset: leadingOffset + actualIdx + 1,
          styles: resolvedStyles
        });
      }
      return;
    }

    // Case 2: `words[i] = ...`
    if (target.type === "IndexExpr" && target.object.type === "Identifier" && target.object.name === "words") {
      const idxRaw = Math.trunc(Number(evalExpr(target.index, env)) || 0);
      const len = wordTokens.length;
      const actualIdx = idxRaw < 0 ? len + idxRaw : idxRaw;
      const tok = wordTokens[actualIdx];
      if (tok) {
        sliceStyles.push({
          fromOffset: tok.from,
          toOffset: tok.to,
          styles: resolvedStyles
        });
      }
      return;
    }

    // Case 3: `line[start:stop] = ...` or delimiter slice `line["(" : ")"] = ...`
    if (target.type === "SliceExpr" && target.object.type === "Identifier" && target.object.name === "line") {
      const startVal = target.start ? evalExpr(target.start, env) : null;
      const stopVal = target.stop ? evalExpr(target.stop, env) : null;

      // Delimiter Slice Shorthand: `line["(" : ")"] = rd, ft2`
      if (typeof startVal === "string" && typeof stopVal === "string" && startVal.length > 0 && stopVal.length > 0) {
        let searchPos = 0;
        while (searchPos < rawLine.length) {
          const openIdx = rawLine.indexOf(startVal, searchPos);
          if (openIdx === -1) break;
          const closeIdx = rawLine.indexOf(stopVal, openIdx + startVal.length);
          if (closeIdx === -1) break;
          const fullEnd = closeIdx + stopVal.length;
          sliceStyles.push({
            fromOffset: openIdx,
            toOffset: fullEnd,
            styles: new Set(resolvedStyles)
          });
          searchPos = fullEnd;
        }
        return;
      }

      const len = leadingTrimmedLine.length;
      const startIdx = startVal !== null ? clampSliceIndex(Math.trunc(Number(startVal) || 0), len) : 0;
      const stopIdx = stopVal !== null ? clampSliceIndex(Math.trunc(Number(stopVal) || 0), len) : len;
      if (stopIdx > startIdx) {
        sliceStyles.push({
          fromOffset: leadingOffset + startIdx,
          toOffset: leadingOffset + stopIdx,
          styles: resolvedStyles
        });
      }
      return;
    }

    // Case 4: `words[start:stop] = ...`
    if (target.type === "SliceExpr" && target.object.type === "Identifier" && target.object.name === "words") {
      const len = wordTokens.length;
      const startVal = target.start ? evalExpr(target.start, env) : null;
      const stopVal = target.stop ? evalExpr(target.stop, env) : null;
      const startIdx = startVal !== null ? clampSliceIndex(Math.trunc(Number(startVal) || 0), len) : 0;
      const stopIdx = stopVal !== null ? clampSliceIndex(Math.trunc(Number(stopVal) || 0), len) : len;
      const firstWord = wordTokens[startIdx];
      const lastWord = wordTokens[stopIdx - 1];
      if (stopIdx > startIdx && firstWord && lastWord) {
        sliceStyles.push({
          fromOffset: firstWord.from,
          toOffset: lastWord.to,
          styles: resolvedStyles
        });
      }
    }
  }

  function execStatements(stmts: StatementNode[], env: Map<string, RuntimeValue>) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case "PresetAssignment": {
          const val = evalExpr(stmt.value, env);
          const list = Array.isArray(val) ? val.map(v => String(v)) : [String(val)];
          const expanded: string[] = [];
          for (const item of list) {
            const sub = presets.get(item);
            if (sub) expanded.push(...sub);
            else expanded.push(item);
          }
          presets.set(stmt.name, expanded);
          break;
        }

        case "ApplyStyleStatement": {
          applyStyleRefs(stmt.styles, activeStyles, env);
          break;
        }

        case "TargetStyleAssignment": {
          if (mode === "line") {
            recordTargetSliceAssignment(stmt, env);
          }
          break;
        }

        case "IfStatement": {
          if (mode === "span") {
            // In span mode, skip branches that only test line/words/line_num without referencing any style or `span`
            let matched = false;
            for (const branch of stmt.branches) {
              if (!conditionMentionsStyleOrSpan(branch.condition, env)) {
                continue;
              }
              if (evalAsCondition(branch.condition, env)) {
                execStatements(branch.body, env);
                matched = true;
                break;
              }
            }
            if (!matched && stmt.elseBody && stmt.branches.some(b => conditionMentionsStyleOrSpan(b.condition, env))) {
              execStatements(stmt.elseBody, env);
            }
            break;
          }

          let matched = false;
          for (const branch of stmt.branches) {
            if (evalAsCondition(branch.condition, env)) {
              execStatements(branch.body, env);
              matched = true;
              break;
            }
          }
          if (!matched && stmt.elseBody) {
            execStatements(stmt.elseBody, env);
          }
          break;
        }

        case "ForStatement": {
          const iterVal = evalExpr(stmt.iterable, env);
          if (!Array.isArray(iterVal)) break;
          const limit = Math.min(iterVal.length, 256);
          for (let i = 0; i < limit; i++) {
            const item = iterVal[i]!;
            const childEnv = new Map(env);
            if (stmt.targets.length === 1) {
              childEnv.set(stmt.targets[0]!, item);
            } else if (stmt.targets.length > 1 && Array.isArray(item)) {
              for (let t = 0; t < stmt.targets.length; t++) {
                childEnv.set(stmt.targets[t]!, item[t] ?? "");
              }
            }
            execStatements(stmt.body, childEnv);
          }
          break;
        }

        case "LegacyLineCommand": {
          if (mode !== "line") break;
          const cmd = stmt.rule;
          if (cmd.scope === "word" && cmd.wordIndex !== undefined) {
            const token = wordTokens[cmd.wordIndex];
            if (token && cmd.patternRegex.test(token.text)) {
              const targetStyles = new Set<string>(resolveStyleIdentifier(cmd.targetStyle, env));
              sliceStyles.push({
                fromOffset: token.from,
                toOffset: token.to,
                styles: targetStyles
              });
            }
          } else if (cmd.scope === "line") {
            const firstToken = wordTokens[0]?.text ?? "";
            const isMatch =
              cmd.patternRegex.test(rawLine) ||
              cmd.patternRegex.test(leadingTrimmedLine) ||
              (firstToken ? cmd.patternRegex.test(firstToken) : false);
            if (isMatch) {
              for (const s of resolveStyleIdentifier(cmd.targetStyle, env)) {
                activeStyles.add(s);
              }
            }
          }
          break;
        }
      }
    }
  }

  // Run up to 5 fixed-point passes for transitive cascades
  for (let pass = 0; pass < 5; pass++) {
    const prevSnapshot = Array.from(activeStyles).join(",");
    sliceStyles = [];
    const env = new Map<string, RuntimeValue>();
    execStatements(program.body, env);

    const nextSnapshot = Array.from(activeStyles).join(",");
    if (prevSnapshot === nextSnapshot) {
      break;
    }
  }

  // Also cascade styles inside each sliceStyles entry (e.g. if slice has `rd` and `if rd: ft1`)
  if (sliceStyles.length > 0) {
    for (const slice of sliceStyles) {
      const sliceEval = evaluateSpanStyles(program, Array.from(slice.styles), rawLine.slice(slice.fromOffset, slice.toOffset), rawLine, words, lineNum);
      slice.styles = sliceEval;
    }
  }

  return {
    lineStyles: activeStyles,
    spanStyles,
    sliceStyles
  };
}

/**
 * Evaluates cascading styles for an inline span (`rd hello rd`) given a compiled `ProgramNode`.
 */
export function evaluateSpanStyles(
  program: ProgramNode,
  initialStyles: string[],
  spanText: string,
  rawLine = "",
  words?: string[],
  lineNum = 1
): Set<string> {
  const activeStyles = new Set<string>(initialStyles);
  const leadingTrimmedLine = rawLine.replace(/^[ \t]+/, "");
  const lineWords = words ?? getLineTokens(rawLine).map(w => w.text);

  const res = evaluateCommands(program, {
    line: leadingTrimmedLine,
    rawLine,
    words: lineWords,
    span: spanText,
    line_num: lineNum,
    initialStyles: activeStyles,
    mode: "span"
  });

  return res.lineStyles;
}
