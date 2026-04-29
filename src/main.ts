import { Plugin } from "obsidian";
import { reactiveVariablesExtension } from "./reactive/cm-extension";
import { createPreviewProcessor } from "./reactive/preview";
import {
  DEFAULT_SETTINGS,
  ReactiveVariablesSettings,
  ReactiveVariablesSettingTab
} from "./settings";

export default class ReactiveVariablesPlugin extends Plugin {
  settings: ReactiveVariablesSettings;

  async onload() {
    await this.loadSettings();

    if (this.settings.enableEditor) {
      this.registerEditorExtension(reactiveVariablesExtension());
    }

    if (this.settings.enablePreview) {
      this.registerMarkdownPostProcessor(createPreviewProcessor(this.app));
    }

    this.addSettingTab(new ReactiveVariablesSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ReactiveVariablesSettings>
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
