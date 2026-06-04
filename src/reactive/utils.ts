import { isColorString, RuleEntry, RuleStyle } from "./engine";

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
  if (style.section === "notes") {
    return false; // Notes styles are used in spatial overlay, not wrapper markdown styling
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
  if (lastStyle.section === "notes") {
    return false; // Skip injecting notes config properties as CSS variables on document container
  }
  if (isTextSizeRuleName(name) || lastStyle.section === "text") {
    return options.enableTextVariables;
  }
  if (lastStyle.section === "colors" || isColorString(lastStyle.val)) {
    return options.enableColorVariables;
  }
  return options.enableColorVariables || options.enableTextVariables;
}

function isTextSizeRuleName(name: string): boolean {
  return /^text_[A-Za-z0-9_-]+_size$/i.test(name) || /^[A-Za-z0-9_-]+_size$/i.test(name);
}
