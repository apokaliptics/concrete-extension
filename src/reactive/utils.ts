import { RuleEntry } from "./engine";

export function sanitizeCssVarName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-");
}

export function applyCssVarsToElement(
  el: HTMLElement,
  rules: Map<string, RuleEntry>,
  prevKeys: string[] = []
): string[] {
  const newKeys: string[] = [];
  for (const [name, entry] of rules) {
    if (entry.type !== "css") {
      continue;
    }

    // Support optional "px" if value is numeric and name ends with _size
    const lastStyle = entry.styles[entry.styles.length - 1];
    if (!lastStyle) continue;
    
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
