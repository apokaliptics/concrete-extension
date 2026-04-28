import { VarEntry } from "./engine";

export function sanitizeCssVarName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-");
}

export function applyCssVarsToElement(
  el: HTMLElement,
  vars: Map<string, VarEntry>,
  prevKeys: string[] = []
): string[] {
  const newKeys: string[] = [];
  for (const [name, entry] of vars) {
    if (entry.type === "error") {
      continue;
    }

    const cssName = `--user-var-${sanitizeCssVarName(name)}`;
    el.style.setProperty(cssName, String(entry.val));
    newKeys.push(cssName);
  }

  for (const key of prevKeys) {
    if (!newKeys.includes(key)) {
      el.style.removeProperty(key);
    }
  }

  return newKeys;
}
