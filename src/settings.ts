import { App, PluginSettingTab, Setting } from "obsidian";
import ReactiveVariablesPlugin from "./main";

export interface ReactiveVariablesSettings {
	enableEditor: boolean;
	enablePreview: boolean;
}

export const DEFAULT_SETTINGS: ReactiveVariablesSettings = {
	enableEditor: true,
	enablePreview: true,
};

export class ReactiveVariablesSettingTab extends PluginSettingTab {
	plugin: ReactiveVariablesPlugin;

	constructor(app: App, plugin: ReactiveVariablesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable editor features")
			.setDesc("Adds inline values, tooltips, and completions in the editor.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEditor)
					.onChange(async (value) => {
						this.plugin.settings.enableEditor = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable preview substitutions")
			.setDesc("Applies reactive variables in reading view. Reload required.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enablePreview)
					.onChange(async (value) => {
						this.plugin.settings.enablePreview = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
