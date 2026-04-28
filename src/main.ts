import { Plugin } from "obsidian";
import { reactiveVariablesExtension } from "./reactive/cm-extension";
import { createPreviewProcessor } from "./reactive/preview";

export default class ReactiveVariablesPlugin extends Plugin {
  async onload() {
    this.registerEditorExtension(reactiveVariablesExtension());
    this.registerMarkdownPostProcessor(createPreviewProcessor(this.app));
  }
}
