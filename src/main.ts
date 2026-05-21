import { Plugin } from "obsidian";
import { reactiveVariablesExtension } from "./reactive/cm-extension";
import { createPreviewProcessor } from "./reactive/preview";
import {
  DEFAULT_SETTINGS,
  ReactiveVariablesSettings,
  ReactiveVariablesSettingTab
} from "./settings";

const SIDEBAR_STYLE_ID = "concrete-hide-pasted-images";
const PASTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

export default class ReactiveVariablesPlugin extends Plugin {
  settings: ReactiveVariablesSettings;

  async onload() {
    await this.loadSettings();

    if (this.settings.enableEditor) {
      this.registerEditorExtension(reactiveVariablesExtension(this.settings));
    }

    if (this.settings.enablePreview) {
      this.registerMarkdownPostProcessor(createPreviewProcessor(this.app, this.settings));
    }

    this.applySidebarStyles();
    this.addSettingTab(new ReactiveVariablesSettingTab(this.app, this));
  }

  onunload() {
    this.removeSidebarStyles();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ReactiveVariablesSettings>
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applySidebarStyles();
  }

  private applySidebarStyles() {
    this.removeSidebarStyles();
    if (this.settings.hidePastedImagesInSidebar) {
      const style = activeDocument.createElement("style");
      style.id = SIDEBAR_STYLE_ID;
      const selectors = PASTED_IMAGE_EXTENSIONS.flatMap((extension) => [
        `.nav-file:has(.nav-file-title[data-path*="Pasted image"][data-path$=".${extension}" i])`,
        `.nav-file-title[data-path*="Pasted image"][data-path$=".${extension}" i]`
      ]);
      style.textContent = `${selectors.join(",\n")} { display: none !important; }`;
      activeDocument.head.appendChild(style);
    }
  }

  private removeSidebarStyles() {
    const existing = activeDocument.getElementById(SIDEBAR_STYLE_ID);
    if (existing) existing.remove();
  }
}
