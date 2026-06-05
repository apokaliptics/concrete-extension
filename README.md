# Concrete Extension

A reactive variable system, spatial overlay workspace, and structural outliner plugin for Obsidian.

Define custom text wrappers, inline color styles, CSS variables, and structural layouts directly inside your notes using a simple, readable syntax. Create floating sticky notes, copy styled content to external apps, and protect LaTeX from formatting collisions — all from a single `:::vars` block.

## Features

### Core editor

- **Custom text wrappers** — Turn `(text)` red, `"text"` blue, or `^text^` into a bold header by defining a simple rule.
- **Letter wrappers** — Use letter pairs like `hh text hh` for highlighting. Letters must be spaced from the content to avoid false matches.
- **Delimiter hiding** — Wrapper symbols are hidden in the rendered view. Click into the line to reveal the raw syntax.
- **Nested wrappers** — Combine multiple styles by nesting wrappers (e.g., `_&text&_`).
- **Combined styles** — Define the same wrapper in both `##colors` and `##text` to stack a color *and* a text style simultaneously.
- **Interactive color palette** — Every hex color in the editor gets a clickable swatch. Click to open the system color picker and update inline.
- **CSS variable injection** — Keys like `header_size = 24` become CSS variables (`--header_size: 24px`) on the document container.
- **Named text variables** — Define any text style name (e.g., `title`, `body`) and link it to a wrapper with `text_{name}_size`.

### Native list interception

- **Styled native bullets** — Standard `-` and `+` list markers are intercepted and replaced with aesthetic bullet characters (`•`, `◦`, `▸`, `▹`, `⁃`, `·`) per indent level.
- **Guide lines and fading opacity** — Deeper indent levels fade visually with guide lines for hierarchy.
- **Ghost bullet effect** — Bullets appear on inactive lines; click into a line to reveal the raw markers for editing.
- **Image-safe** — Lines containing image embeds (`![[...]]` or `![...](...)`) are skipped by the outliner.

### Color autocomplete

- **Context-aware color picker** — Typing `#` on a color property line inside a `:::vars` block spawns a floating swatch palette with 9 preset colors and a custom color picker button.
- **Auto-fill** — Selecting a swatch or using the custom picker writes the hex value directly into the document.
- **Auto-dismiss** — The popup disappears when the cursor leaves the color scope.

### Data portability and clipboard

- **Variable-stripped copying** — Right-click context menu item "Copy content without variables" strips all `:::vars` blocks and writes clean text to the clipboard.
- **Cross-platform style preservation** — Copying content writes a dual-flavor clipboard payload:
  - `text/plain`: Clean, variable-stripped markdown text.
  - `text/html`: Compiled HTML with inline CSS (`<span style="...">`) so styles survive when pasted into Google Docs, Word, etc.

### Spatial overlay system (Sticky notes)

- **Floating canvas layer** — A non-destructive overlay layer sits above the document text. Right-click to create a sticky note at any position.
- **Interactive notes** — Notes default to 100×100 pixels and support:
  - **Drag** anywhere across the overlay.
  - **Resize** by pulling the corner handle.
  - **Rotate** freely using the rotation handle.
  - **Lock** via a toggle button to prevent accidental edits.
  - **Rich text** content with image support.
  - **Delete** with a single click.
- **`#notes` scope in `:::vars`** — Configure sticky note defaults programmatically:
  ```
  :::vars
  #notes
  text_size = 14
  text_colour = #333333
  note_size = 120 x 80
  note_colour = #fffae6
  :::
  ```
- **Automatic persistence** — Notes are serialized back into the `:::vars` block and saved with the document.

### Global configuration defaults

- **Global vars block** — A text area in the plugin settings serializes directly to `data.json`. Any variables defined here apply as a universal foundation across all notes in the vault.
- **Local override** — Inline `:::vars` blocks automatically inherit, merge with, and override global defaults.

### Layout presets

- **Pre-made layout dropdowns** — Select from bundled preset schemes ("Classic Red & Blue", "Minimalist Mint", "Royal Purple & Gold") via a modal dropdown to instantly format documents.
- **Ribbon icon and command** — Access presets from the ribbon or with the "Insert layout preset" command.
- **Community presets pipeline** — The `src/templates/` directory is structured to accept community-contributed layout configurations via GitHub Pull Requests.

### LaTeX protection

- **Parse-exclusion boundaries** — Native LaTeX blocks (`$...$` and `$$...$$`) override the variable engine. Any character ranges inside math wrappers are completely masked out, preventing formatting collisions with LaTeX symbols like underscores, carets, or braces.

### Other

- **Collapsible config block** — The `:::vars` block features an inline fold toggle. Fold it to see a summary like `▶ [VARS: 4 colors, 2 styles]`.
- **Hide pasted images in sidebar** — Toggle to hide "Pasted image ..." files from the File Explorer.
- **Live Preview & Reading View** — All features work in both editor modes.

---

## How to use

### 1. Create a `:::vars` block

Place this block anywhere in your note. It defines all your styling rules.

```yaml
:::vars
##colors
() = #ef4444
"" = #3b82f6
hh = #10b981
&& = #8b5cf6

##text
header_size = 32
paragraph_size = 14

^^ = header
.. = paragraph
__ = underline
&& = bold

# Or use the named syntax:
##text
text_title_size = 32
text_body_size = 14

title = ^^
body = ..
__ = underline
:::
```

### 2. Sections

Rules are organized under section headers prefixed with `##`:

| Section | Purpose |
|---|---|
| `##colors` (or `##colour`, `##colours`) | Rules here treat values as colors. Wrapped text will be colored. |
| `##text` | Rules here treat values as CSS class names or text styles. Use `text_name_size = number` and `name = ^^` for named variables. |
| `#notes` | Configures spatial overlay sticky note defaults (`text_size`, `text_colour`, `note_size`, `note_colour`). |

### 3. Color wrappers (under `##colors`)

Define a wrapper symbol and assign it a color value.

```
##colors
() = #ef4444
"" = #3b82f6
```

Then use them in your note:

```
(This text will be red!)
"This text will be blue!"
```

**Result:** The wrapper symbols are hidden. You only see the styled text.

### 4. Text wrappers (under `##text`)

Define wrappers that apply CSS classes instead of colors.

```
##text
^^ = header
__ = underline
```

Usage:

```
^This becomes a header^
_This becomes underlined_
```

**Named text variables:**
Name text styles anything you want using the `text_{name}_size = {number}` convention:

```
##text
text_title_size = 32
text_body_size = 14

title = ^^
body = ..
```

Now `^Title text^` uses `--text_title_size: 32px` and `.Body text.` uses `--text_body_size: 14px`.

**Built-in styles:**

| Class | Effect |
|---|---|
| `header` | Bold text, sized by `header_size` or `text_header_size` (default `1.5em`) |
| `paragraph` | Normal text, sized by `paragraph_size` or `text_paragraph_size` (default `1em`) |
| `bold` | **Bold** text |
| `italic` | *Italic* text |
| `underline` | <ins>Underlined</ins> text |
| `strikethrough` | ~~Strikethrough~~ text |
| `highlight` | Applies a background highlight color |

*(You can define any other value and style it yourself with a CSS snippet targeting `.rv-{value}`)*

### 5. Nested & combined wrappers

**Nesting wrappers:**
```
_&This text is bold and underlined!&_
```

**Combining styles:**
Define the same wrapper in both sections:

```yaml
:::vars
##colors
&& = #ff0000

##text
&& = header
header_size = 70
:::
```
Now, writing `&Huge red header!&` applies the color **and** the header size simultaneously.

### 6. Letter wrappers

Use letter pairs as wrappers. They **must be spaced** from the content:

```
##colors
hh = #10b981
```

Usage:

```
hh This text will be green hh
```

> **Why spaces?** To prevent false matches with normal words that happen to start and end with the same letters.

### 7. CSS variables

Alphanumeric keys with underscores or hyphens become CSS variables:

```
header_size = 24
paragraph_size = 14
```

These become `--header_size: 24px` and `--paragraph_size: 14px` on the document container. The built-in `.rv-header` and `.rv-paragraph` classes reference these variables.

Named convention:

```
text_title_size = 32
text_body_size = 14
```

These become `--text_title_size: 32px` and `--text_body_size: 14px`. Named text variables (`title = ^^`) automatically pick up the matching size variable.

### 8. Wrapper syntax rules

| Key | Type | Start | End | Example |
|---|---|---|---|---|
| `()` | Asymmetric symbols | `(` | `)` | `(colored text)` |
| `""` | Symmetric symbols | `"` | `"` | `"colored text"` |
| `^^` | Symmetric symbols | `^` | `^` | `^header text^` |
| `hh` | Letter wrapper | `hh ` | ` hh` | `hh highlighted hh` |

**Asymmetric** (2 different chars): first char = start, second char = end.
**Symmetric** (2 same chars): that char = both start and end.
**Letters** (2+ letters): the full key is used, must be surrounded by spaces.

### 9. Interactive color picker

In the editor, every hex color value in your `:::vars` block gets a small color swatch next to it. Click the swatch to open your system's native color picker — changing the color automatically updates the hex code in your note.

### 10. Color autocomplete

When typing inside a `:::vars` block on a color property line, type `#` to trigger a floating color palette popup. Select from 9 preset swatches or click "🌈 Custom color" for the full system picker. The hex value is written directly into the text.

### 11. Sticky notes

Right-click in the editor and select **Create sticky note** to spawn a floating note. Notes support:

- Drag to reposition
- Resize from the corner
- Rotate using the rotation handle
- Lock/unlock with the lock icon toggle
- Delete with the delete button
- Rich text editing

Configure defaults with a `#notes` section in your `:::vars` block.

### 12. Global defaults

Open **Settings → Concrete** and use the **Global configuration defaults** text area to define variables that apply to every note. These act as a universal base — local `:::vars` blocks in each note inherit and can override them.

### 13. Layout presets

Click the layout icon in the ribbon or use the command **Insert layout preset** to open the preset selector. Choose from presets like **Classic Red & Blue**, **Minimalist Mint**, **Cozy Journal**, **Academic & Research**, or **Spatial Brainstorming & Mindmap** to instantly configure variables and note styling.

The selected scheme's `:::vars` block is inserted at the top of your note.

## Settings

The plugin settings panel is organized into four categories:

### Core configuration
- **Enable editor features** — Adds inline values, tooltips, and completions in the editor.
- **Enable preview substitutions** — Applies reactive variables in reading view.
- **Global configuration defaults** — Text area for vault-wide variable definitions.

### Editor behaviors
- **Use bullet points** — Toggle the native list interception and styling.
- **Use colour variables** — Enable/disable color wrappers, color CSS variables, and the editor color picker.
- **Use text variables** — Enable/disable text wrappers and text size variables.

### Sticky notes fallback defaults
- **Default note size** — Fallback note size (e.g. `200x150` or `160`).
- **Default note color** — Fallback background color (hex, e.g. `#fffbeb`).
- **Default note text color** — Fallback note text color (hex, e.g. `#451a03`).
- **Default note text size** — Fallback text size in note content (e.g. `14px`).

### Advanced
- **Hide pasted images in sidebar** — Hide "Pasted image ..." files from the File Explorer.

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Place them in `VaultFolder/.obsidian/plugins/concrete-extension/`.
3. Reload Obsidian.
4. Enable **Concrete** in **Settings → Community plugins**.

### Development
1. Clone this repo into your `.obsidian/plugins/` folder.
2. `npm install`
3. `npm run dev` — compiles and watches for changes.
4. `npm run build` — production build.
5. `npm run lint` — checks for style errors.
