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

/**
 * Tokenizes a single line into words/tokens with character offsets.
 */
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

/**
 * Compiles a pattern string like '("(" + number + ")")' or '">"' or 'word' into a regular expression.
 */
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
 * Parses a single line under ##commands.
 * Supported syntax:
 * - if line <N> <pattern> then <target>
 * - if line <pattern> then <target>
 * - if <source> then <target>
 */
export function parseCommandLine(line: string): CommandRule | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("if ") && !trimmed.startsWith("if\t")) {
    return null;
  }

  const thenIdx = trimmed.indexOf(" then ");
  if (thenIdx === -1) {
    return null;
  }

  const conditionPart = trimmed.slice(3, thenIdx).trim();
  const targetStyle = trimmed.slice(thenIdx + 6).trim();
  if (!conditionPart || !targetStyle) {
    return null;
  }

  // Check for "line <index> <pattern>" or "line <pattern>"
  if (conditionPart.startsWith("line ") || conditionPart === "line") {
    const afterLine = conditionPart.slice(5).trim();
    const matchIndexed = /^(\d+)\s+(.+)$/.exec(afterLine);

    if (matchIndexed && matchIndexed[1] !== undefined && matchIndexed[2] !== undefined) {
      const wordIndex = parseInt(matchIndexed[1], 10);
      const patternRaw = matchIndexed[2].trim();
      const patternRegex = compilePattern(patternRaw);
      
      // If pattern is a blockquote marker like ">", or explicit line font, treat as whole line
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

    // Unindexed "line <pattern>" -> styles the entire line
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

  // Otherwise: Style chaining: "if <source> then <target>"
  return {
    type: "chain",
    sourceStyle: conditionPart,
    targetStyle
  };
}

/**
 * Resolves all chained styles for a given active style name.
 */
export function resolveChainedStyles(
  activeStyles: string[],
  chainCommands: ChainCommand[]
): string[] {
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
