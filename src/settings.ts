import { App, PluginSettingTab, Setting } from "obsidian";
import ReactiveVariablesPlugin from "./main";
import { PRESETS } from "./templates";

export interface ReactiveVariablesSettings {
	enableEditor: boolean;
	enablePreview: boolean;
	enableBulletPoints: boolean;
	enableColorVariables: boolean;
	enableTextVariables: boolean;
	globalVars: string;
}

export const DEFAULT_SETTINGS: ReactiveVariablesSettings = {
	enableEditor: true,
	enablePreview: true,
	enableBulletPoints: true,
	enableColorVariables: true,
	enableTextVariables: true,
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
					.setPlaceholder("##colors\n() = #ef4444\n\n##text\nheader_size = 24\ntext_ft1_font = inter\n\n##commands\nif rd then ft1")
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
	}
}

function setStyle(el: HTMLElement, name: string, value: string): void {
	el.style.setProperty(name, value);
}
