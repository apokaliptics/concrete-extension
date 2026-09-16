import { isColorString, RuleEntry, RuleStyle, WrapperMatch } from "./engine";

export interface ReactiveFeatureOptions {
  enableBulletPoints: boolean;
  enableColorVariables: boolean;
  enableTextVariables: boolean;
  globalVars: string;
}

const DEFAULT_FEATURE_OPTIONS: ReactiveFeatureOptions = {
  enableBulletPoints: true,
  enableColorVariables: true,
  enableTextVariables: true,
  globalVars: ""
};

export function sanitizeCssVarName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-");
}

export function applyCssVarsToElement(
  el: HTMLElement,
  rules: Map<string, RuleEntry>,
  prevKeys: string[] = [],
  options?: Partial<ReactiveFeatureOptions>
): string[] {
  const featureOptions = getFeatureOptions(options);
  const newKeys: string[] = [];
  for (const [name, entry] of rules) {
    if (entry.type !== "css") {
      continue;
    }

    // Support optional "px" if value is numeric and name ends with _size
    const lastStyle = entry.styles[entry.styles.length - 1];
    if (!lastStyle) continue;
    if (!isCssRuleEnabled(name, entry, featureOptions)) continue;
    
    let val = lastStyle.val;
    if (/^[0-9]+$/.test(val) && (name.endsWith("size") || name.endsWith("Size"))) {
        val += "px";
    }

    const cssName = `--${sanitizeCssVarName(name)}`;
    el.style.setProperty(cssName, val);
    newKeys.push(cssName);
  }

  for (const key of prevKeys) {
    if (!newKeys.includes(key)) {
      el.style.removeProperty(key);
    }
  }

  return newKeys;
}

export function getEnabledStyles(rule: RuleEntry, options?: Partial<ReactiveFeatureOptions>): RuleStyle[] {
  const featureOptions = getFeatureOptions(options);
  return rule.styles.filter((style) => isStyleEnabled(style, featureOptions));
}

export function hasEnabledStyles(rule: RuleEntry, options?: Partial<ReactiveFeatureOptions>): boolean {
  return getEnabledStyles(rule, options).length > 0;
}

export function getTextSizeCssVar(
  styleName: string,
  rules: Map<string, RuleEntry>,
  options?: Partial<ReactiveFeatureOptions>
): string | null {
  const featureOptions = getFeatureOptions(options);
  if (!featureOptions.enableTextVariables) return null;

  const sizeNames = [`text_${styleName}_size`, `${styleName}_size`];
  for (const name of sizeNames) {
    const entry = rules.get(name);
    if (!entry || entry.type !== "css") continue;
    if (!isCssRuleEnabled(name, entry, featureOptions)) continue;
    return `--${sanitizeCssVarName(name)}`;
  }

  return null;
}

export function isStyleEnabled(style: RuleStyle, options?: Partial<ReactiveFeatureOptions>): boolean {
  const featureOptions = getFeatureOptions(options);
  if (style.section === "colors" || isColorString(style.val)) {
    return featureOptions.enableColorVariables;
  }
  if (style.section === "text") {
    return featureOptions.enableTextVariables;
  }
  return featureOptions.enableColorVariables || featureOptions.enableTextVariables;
}

function getFeatureOptions(options?: Partial<ReactiveFeatureOptions>): ReactiveFeatureOptions {
  return { ...DEFAULT_FEATURE_OPTIONS, ...(options ?? {}) };
}

function isCssRuleEnabled(
  name: string,
  entry: RuleEntry,
  options: ReactiveFeatureOptions
): boolean {
  const lastStyle = entry.styles[entry.styles.length - 1];
  if (!lastStyle) return false;
  if (isTextSizeRuleName(name) || isTextFontRuleName(name) || lastStyle.section === "text") {
    return options.enableTextVariables;
  }
  if (lastStyle.section === "colors" || isColorString(lastStyle.val)) {
    return options.enableColorVariables;
  }
  return options.enableColorVariables || options.enableTextVariables;
}

function isTextFontRuleName(name: string): boolean {
  return /^text_[A-Za-z0-9_-]+_font$/i.test(name) || /^[A-Za-z0-9_-]+_font$/i.test(name) || name === "font";
}

function isTextSizeRuleName(name: string): boolean {
  return /^text_[A-Za-z0-9_-]+_size$/i.test(name) || /^[A-Za-z0-9_-]+_size$/i.test(name);
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

export function compileToHTML(
  text: string,
  from: number,
  to: number,
  matches: WrapperMatch[],
  rules: Map<string, RuleEntry>,
  options?: Partial<ReactiveFeatureOptions>
): string {
  let html = "";
  let index = from;
  const innerMatches = matches.filter(m => m.fullFrom >= from && m.fullTo <= to);

  while (index < to) {
    const nextMatch = innerMatches.find(m => m.fullFrom >= index);
    if (!nextMatch) {
      html += escapeHTML(text.slice(index, to));
      break;
    }

    if (nextMatch.fullFrom > index) {
      html += escapeHTML(text.slice(index, nextMatch.fullFrom));
    }

    let styleStr = "";
    for (const style of getEnabledStyles(nextMatch.rule, options)) {
      if (style.section === "colors" || isColorString(style.val)) {
        styleStr += `color: ${style.val};`;
      } else {
        if (style.val.startsWith("font:")) {
          const fontVar = style.val.slice(5);
          const entry = rules.get(fontVar) ?? rules.get(`text_${fontVar}_font`) ?? rules.get(`${fontVar}_font`);
          const fontVal = entry?.styles[entry.styles.length - 1]?.val;
          if (fontVal) {
            styleStr += `font-family: ${fontVal};`;
          } else {
            styleStr += `font-family: var(--text_${fontVar}_font, var(--${fontVar}_font, var(--${fontVar}, inherit)));`;
          }
        } else if (style.val === "bold") {
          styleStr += "font-weight: bold;";
        } else if (style.val === "italic") {
          styleStr += "font-style: italic;";
        } else if (style.val === "underline") {
          styleStr += "text-decoration: underline;";
        } else if (style.val === "strikethrough") {
          styleStr += "text-decoration: line-through;";
        } else if (style.val === "highlight") {
          styleStr += "background-color: #fff5b1;";
        } else if (style.val === "header") {
          styleStr += "font-weight: bold;";
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          } else {
            styleStr += "font-size: 1.5em;";
          }
        } else if (style.val === "paragraph") {
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          } else {
            styleStr += "font-size: 1em;";
          }
        } else {
          const sizeVar = getTextSizeCssVar(style.val, rules, options);
          if (sizeVar) {
            const sizeName = sizeVar.substring(2);
            const entry = rules.get(sizeName);
            const lastStyle = entry?.styles[entry.styles.length - 1];
            if (lastStyle) {
              let val = lastStyle.val;
              if (/^\d+$/.test(val)) val += "px";
              styleStr += `font-size: ${val};`;
            }
          }
        }
      }
    }

    const innerContent = compileToHTML(text, nextMatch.contentFrom, nextMatch.contentTo, innerMatches, rules, options);
    if (styleStr) {
      html += `<span style="${styleStr}">${innerContent}</span>`;
    } else {
      html += innerContent;
    }

    index = nextMatch.fullTo;
  }

  return html;
}

