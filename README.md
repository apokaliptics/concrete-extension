# Concrete Extension

A lightweight and highly customizable text styling and color highlighting system for Obsidian. 

This plugin allows you to define custom text wrappers, inline styles, and CSS variables directly within your notes using a simple, readable syntax. It completely bypasses complex settings menus, letting you control your document's aesthetics right from the editor!

## Features

- **Custom Text Wrappers**: Turn `(any text)` red, `"any text"` blue, or `^^any text^^` into a bold header just by defining a simple rule.
- **Interactive Color Palette**: Any hex color you define gets an interactive color swatch right inside the editor! Clicking it opens your system color picker, allowing you to tweak colors on the fly.
- **Live Preview & Reading View Support**: Your custom styles are rendered beautifully in both Live Preview and Reading View.
- **CSS Variables Injection**: Define CSS variables directly in your notes (like `header_size = 24`) that you can use in custom CSS snippets.
- **Tag Override**: The plugin automatically prevents Obsidian from incorrectly rendering your hex color codes as clickable tags.

## How to Use

To define your styling rules, create a `:::vars` code block anywhere in your note (or use the YAML frontmatter).

The block is divided into two optional sections: `colors` (or `colour`/`colours`) and `text`.

### Example Configuration

```yaml
:::vars
colors
() = #ef4444
"" = #3b82f6

text
header_size = 24
paragraph_size = 14
^^ = header
.. = paragraph
:::
```

### The `colors` Section
Rules placed under the `colors` category will treat their values as colors. 
For example, `() = #ef4444` means: "Find any text wrapped in `()` and color it `#ef4444`".
- In the editor, a small, clickable color swatch will appear next to `#ef4444`. You can click this swatch to open a color picker and interactively change the color!

### The `text` Section
Rules placed under the `text` category will treat their values as styling classes.
- **Wrappers**: `^^ = header` means: "Find any text wrapped in `^^` and apply the `.rv-header` CSS class to it."
- **Variables**: `header_size = 24` is an alphanumeric key. Because it doesn't represent a text wrapper, the plugin automatically exports it as a CSS variable `--header_size: 24px` to the document, which the `.rv-header` class uses to scale your text!

### Wrapper Syntax Rules
The plugin intelligently identifies your wrapper boundaries based on the characters you provide:
- **Asymmetrical Wrappers (e.g., `()` or `[]` or `<>`)**: The plugin uses the first character as the start boundary and the second character as the end boundary. E.g., `(Text goes here)`.
- **Symmetrical Wrappers (e.g., `""` or `^^` or `;;`)**: If you provide two identical characters, the plugin will use that character as both the start and end boundary. E.g., `"Text goes here"` or `^Text goes here^`.

## Installation

### Manual Installation
1. Download the latest release from the Releases page.
2. Extract `main.js`, `manifest.json`, and `styles.css` into your vault's plugins folder: `VaultFolder/.obsidian/plugins/concrete-extension/`.
3. Reload Obsidian.
4. Enable "Concrete Extension" in your Community Plugins settings.

### Development
1. Clone this repository into your `.obsidian/plugins/` folder.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to compile the plugin and watch for changes.
4. (Optional) Run `npm run lint` to check for style errors.
