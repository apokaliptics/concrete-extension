import { App, PluginSettingTab, Setting } from "obsidian";
import ReactiveVariablesPlugin from "./main";

export interface ReactiveVariablesSettings {
	enableEditor: boolean;
	enablePreview: boolean;
	enableBulletPoints: boolean;
	enableColorVariables: boolean;
	enableTextVariables: boolean;
	hidePastedImagesInSidebar: boolean;
}

export const DEFAULT_SETTINGS: ReactiveVariablesSettings = {
	enableEditor: true,
	enablePreview: true,
	enableBulletPoints: true,
	enableColorVariables: true,
	enableTextVariables: true,
	hidePastedImagesInSidebar: false,
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

		new Setting(containerEl)
			.setName("Feature checklist")
			.setDesc("Turn off individual features you do not want to use.");

		new Setting(containerEl)
			.setName("Use bullet points")
			.setDesc("Replaces dash outline markers with styled bullets.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBulletPoints)
					.onChange(async (value) => {
						this.plugin.settings.enableBulletPoints = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use colour variables")
			.setDesc("Applies colour wrappers, colour CSS variables, and editor colour pickers.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableColorVariables)
					.onChange(async (value) => {
						this.plugin.settings.enableColorVariables = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use text variables")
			.setDesc("Applies text wrappers and text size variables.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTextVariables)
					.onChange(async (value) => {
						this.plugin.settings.enableTextVariables = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hide pasted images in sidebar")
			.setDesc("Hides 'Pasted image ...' files from the File Explorer.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hidePastedImagesInSidebar)
					.onChange(async (value) => {
						this.plugin.settings.hidePastedImagesInSidebar = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
