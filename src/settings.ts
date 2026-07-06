import { App, PluginSettingTab, Setting } from "obsidian";
import ReactiveVariablesPlugin from "./main";
import { PRESETS } from "./templates";

export interface ReactiveVariablesSettings {
	enableEditor: boolean;
	enablePreview: boolean;
	enableBulletPoints: boolean;
	enableColorVariables: boolean;
	enableTextVariables: boolean;
	hidePastedImagesInSidebar: boolean;
	globalVars: string;
	defaultNoteSize: string;
	defaultNoteColour: string;
	defaultNoteTextColour: string;
	defaultNoteTextSize: string;
}

export const DEFAULT_SETTINGS: ReactiveVariablesSettings = {
	enableEditor: true,
	enablePreview: true,
	enableBulletPoints: true,
	enableColorVariables: true,
	enableTextVariables: true,
	hidePastedImagesInSidebar: false,
	globalVars: "",
	defaultNoteSize: "200x150",
	defaultNoteColour: "",
	defaultNoteTextColour: "",
	defaultNoteTextSize: "14px",
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
			.setName("Global layout preset")
			.setDesc("Choose a pre-configured template variables scheme to apply globally.")
			.addDropdown((dropdown) => {
				dropdown.addOption("custom", "Custom / none");
				for (const preset of PRESETS) {
					dropdown.addOption(preset.id, preset.name);
				}

				const matchedPreset = PRESETS.find(
					(p) => p.varsBlock.trim() === this.plugin.settings.globalVars.trim()
				);
				dropdown.setValue(matchedPreset ? matchedPreset.id : "custom");

				dropdown.onChange(async (value) => {
					if (value === "custom") {
						this.plugin.settings.globalVars = "";
						await this.plugin.saveSettings();
						this.display();
					} else {
						const preset = PRESETS.find((p) => p.id === value);
						if (preset) {
							this.plugin.settings.globalVars = preset.varsBlock;
							await this.plugin.saveSettings();
							this.display();
						}
					}
				});
			});

		new Setting(containerEl)
			.setName("Global configuration defaults")
			.setDesc("Define a default vars block that applies to all notes across the vault.")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				setStyle(text.inputEl, "width", "100%");
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

		// Category 3: Sticky Notes Defaults
		new Setting(containerEl).setName("Sticky notes fallback defaults").setHeading();

		new Setting(containerEl)
			.setName("Default note size")
			.setDesc("Fallback note size, for example 200x150 or 160.")
			.addText((text) =>
				text
					.setPlaceholder("200x150")
					.setValue(this.plugin.settings.defaultNoteSize)
					.onChange(async (value) => {
						this.plugin.settings.defaultNoteSize = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default note color")
			.setDesc("Fallback background color (hex, e.g. #fffbeb. Leave blank for theme adaptive).")
			.addText((text) =>
				text
					.setPlaceholder("#fffbeb")
					.setValue(this.plugin.settings.defaultNoteColour)
					.onChange(async (value) => {
						this.plugin.settings.defaultNoteColour = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default note text color")
			.setDesc("Fallback note text color (hex, e.g. #451a03. Leave blank for theme adaptive).")
			.addText((text) =>
				text
					.setPlaceholder("#451a03")
					.setValue(this.plugin.settings.defaultNoteTextColour)
					.onChange(async (value) => {
						this.plugin.settings.defaultNoteTextColour = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default note text size")
			.setDesc("Fallback text size in note content (e.g. 14px or 12).")
			.addText((text) =>
				text
					.setPlaceholder("14px")
					.setValue(this.plugin.settings.defaultNoteTextSize)
					.onChange(async (value) => {
						this.plugin.settings.defaultNoteTextSize = value.trim();
						await this.plugin.saveSettings();
					})
			);

		// Category 4: Advanced Settings
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

function setStyle(el: HTMLElement, name: string, value: string): void {
	el.style.setProperty(name, value);
}
