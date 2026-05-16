import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				activeWindow: "readonly",
				activeDocument: "readonly",
				createSpan: "readonly",
				createEl: "readonly",
				createFragment: "readonly",
				createDiv: "readonly",
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.js", "manifest.json"],
				},
				tsconfigRootDir: __dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...(obsidianmd.configs?.recommended as any[] || []),
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	])
);
