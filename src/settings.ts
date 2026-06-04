/* eslint-disable obsidianmd/no-static-styles-assignment */
import { App, PluginSettingTab, Setting } from "obsidian";
import ReactiveVariablesPlugin from "./main";

export interface ReactiveVariablesSettings {
	enableEditor: boolean;
	enablePreview: boolean;
	enableBulletPoints: boolean;
	enableColorVariables: boolean;
	enableTextVariables: boolean;
	hidePastedImagesInSidebar: boolean;
	globalVars: string;
}

export const DEFAULT_SETTINGS: ReactiveVariablesSettings = {
	enableEditor: true,
	enablePreview: true,
	enableBulletPoints: true,
	enableColorVariables: true,
	enableTextVariables: true,
	hidePastedImagesInSidebar: false,
	globalVars: "",
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

		// Category 1: Core Configuration
		new Setting(containerEl).setName("Core configuration").setHeading();

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
			.setName("Global configuration defaults")
			.setDesc("Define a default vars block that applies to all notes across the vault.")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.inputEl.style.setProperty("width", "100%");
				text
					.setPlaceholder("##colors\n() = #ef4444\n\n##text\nheader_size = 24")
					.setValue(this.plugin.settings.globalVars)
					.onChange(async (value) => {
						this.plugin.settings.globalVars = value;
						await this.plugin.saveSettings();
					});
			});

		// Category 2: Editor Behaviors
		new Setting(containerEl).setName("Editor behaviors").setHeading();

		new Setting(containerEl)
			.setName("Use bullet points")
			.setDesc("Styles native list bullets with the aesthetic hierarchy.")
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

		// Category 3: Advanced Settings
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Hide pasted images in sidebar")
			.setDesc("Hides pasted image files from the file explorer.")
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
