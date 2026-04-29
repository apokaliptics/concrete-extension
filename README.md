# Concrete Extension

A lightweight text styling, color highlighting, and structural outliner plugin for Obsidian.

Define custom text wrappers, inline color styles, CSS variables, and dash-based outline levels directly inside your notes using a simple, readable syntax — no settings menus required.

## Features

- **Custom text wrappers** — Turn `(text)` red, `"text"` blue, or `^text^` into a bold header by defining a simple rule.
- **Letter wrappers** — Use letter pairs like `hh text hh` for highlighting. The letters must be grouped together and spaced from the content to avoid false matches with normal words.
- **Delimiter hiding** — Wrapper symbols are hidden in the rendered view. You only see the styled content; click into the line to reveal the raw syntax.
- **Nested Wrappers** — Apply multiple styles to the same text by nesting them seamlessly (e.g., `_&text&_`).
- **Combined Styles** — Reuse the same wrapper symbol across different sections to stack multiple effects simultaneously (e.g., apply a color *and* a massive header size with a single wrapper!).
- **Interactive color palette** — Every hex color you define gets a clickable swatch in the editor. Click it to open the system color picker and update the color inline.
- **CSS variable injection** — Keys like `header_size = 24` become `--header_size: 24px` CSS variables you can use in custom snippets.
- **Dash-level outliner** — Lines starting with `-`, `--`, `---` etc. become indented outline levels with aesthetic bullets, guide lines, and fading opacity.
- **Ghost dash effect** — Dashes are hidden on non-active lines and replaced with styled bullets. Click into a line to reveal the raw dashes for editing.
- **Collapsible config block** — The `:::vars` block features an inline toggle. Fold it away when you're done configuring, and it will cleanly display a summary like `▶ [VARS: 4 colors, 2 styles]`.
- **Live Preview & Reading View** — All features work in both editor modes.

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
:::
```

### 2. Sections

Rules are organized under section headers prefixed with `##`:

| Section | Purpose |
|---|---|
| `##colors` (or `##colour`, `##colours`) | Rules here treat values as colors. Wrapped text will be colored. |
| `##text` | Rules here treat values as CSS class names. Wrapped text gets the corresponding `.rv-{value}` class applied. |

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

**Result:** The wrapper symbols `(`, `)`, `"`, `"` are hidden. You only see the styled text.

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

**Built-in Styles**
The plugin ships with several out-of-the-box styles you can use immediately under `##text`:

| Class | Effect |
|---|---|
| `header` | Bold text, sized by `--header_size` (default `1.5em`) |
| `paragraph` | Normal text, sized by `--paragraph_size` (default `1em`) |
| `bold` | **Bold** text |
| `italic` | *Italic* text |
| `underline` | <ins>Underlined</ins> text |
| `strikethrough` | ~~Strikethrough~~ text |
| `highlight` | Applies a background highlight color |

*(You can define any other value and style it yourself with a CSS snippet targeting `.rv-{value}`)*

### 5. Advanced: Nested & Combined Wrappers

**Nesting Wrappers:**
You can combine multiple text wrappers by nesting them inside each other!
```
_&This text is bold and underlined!&_
```

**Combining Styles:**
If you want a single wrapper to do multiple things, just define it in **both** sections! 

```yaml
:::vars
##colors
&& = #ff0000

##text
&& = header
header_size = 70
:::
```
Now, writing `&Huge red header!&` will automatically apply the color `#ff0000` **and** the massive `header` size simultaneously.

### 6. Letter wrappers

You can also use letter pairs as wrappers. They **must be spaced** from the content:

```
##colors
hh = #10b981
```

Usage:

```
hh This text will be green hh
```

> **Why spaces?** To prevent false matches with normal words that happen to start and end with the same letter. `hh text hh` matches, but `hello` does not.

### 7. CSS variables

Alphanumeric keys with underscores or hyphens become CSS variables:

```
header_size = 24
paragraph_size = 14
```

These become `--header_size: 24px` and `--paragraph_size: 14px` on the document container. The built-in `.rv-header` and `.rv-paragraph` classes reference these variables.

### 8. Dash-level outliner

Start any line with one or more dashes followed by a space to create outline levels:

```
- Level 1 item
-- Level 2 sub-item
--- Level 3 deep item
---- Level 4
```

**What happens:**

- Each dash level gets increasing indentation and a guide line on the left.
- The raw dashes are replaced with aesthetic bullet characters (`•`, `◦`, `▸`, etc.).
- Deeper levels automatically fade in opacity for visual hierarchy.
- **Ghost dash effect:** Click into a line to reveal the raw dashes for editing. Move away and the bullets return.

### 9. Wrapper syntax rules

| Key | Type | Start | End | Example |
|---|---|---|---|---|
| `()` | Asymmetric symbols | `(` | `)` | `(colored text)` |
| `""` | Symmetric symbols | `"` | `"` | `"colored text"` |
| `^^` | Symmetric symbols | `^` | `^` | `^header text^` |
| `hh` | Letter wrapper | `hh ` | ` hh` | `hh highlighted hh` |

**Asymmetric** (2 different chars): first char = start, second char = end.
**Symmetric** (2 same chars): that char = both start and end.
**Letters** (2+ letters): the full key is used, must be surrounded by spaces.

### 10. Interactive color picker

In the editor, every hex color value in your `:::vars` block gets a small color swatch next to it. Click the swatch to open your system's native color picker — changing the color automatically updates the hex code in your note.

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Place them in `VaultFolder/.obsidian/plugins/concrete-extension/`.
3. Reload Obsidian.
4. Enable **Concrete Extension** in **Settings → Community plugins**.

### Development
1. Clone this repo into your `.obsidian/plugins/` folder.
2. `npm install`
3. `npm run dev` — compiles and watches for changes.
4. `npm run lint` — checks for style errors.
