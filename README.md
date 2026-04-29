# Concrete Extension

A lightweight text styling, color highlighting, and structural outliner plugin for Obsidian.

Define custom text wrappers, inline color styles, CSS variables, and dash-based outline levels directly inside your notes using a simple, readable syntax — no settings menus required.

## Features

- **Custom text wrappers** — Turn `(text)` red, `"text"` blue, or `^text^` into a bold header by defining a simple rule.
- **Letter wrappers** — Use letter pairs like `hh text hh` for highlighting. The letters must be grouped together and spaced from the content to avoid false matches with normal words.
- **Delimiter hiding** — Wrapper symbols are hidden in the rendered view. You only see the styled content; click into the line to reveal the raw syntax.
- **Interactive color palette** — Every hex color you define gets a clickable swatch in the editor. Click it to open the system color picker and update the color inline.
- **CSS variable injection** — Keys like `header_size = 24` become `--header_size: 24px` CSS variables you can use in custom snippets.
- **Dash-level outliner** — Lines starting with `-`, `--`, `---` etc. become indented outline levels with aesthetic bullets, guide lines, and fading opacity.
- **Ghost dash effect** — Dashes are hidden on non-active lines and replaced with styled bullets. Click into a line to reveal the raw dashes for editing.
- **Live Preview & Reading View** — All features work in both editor modes.

## How to use

### 1. Create a `:::vars` block

Place this block anywhere in your note. It defines all your styling rules.

```
:::vars
##colors
() = #ef4444
"" = #3b82f6
hh = #10b981

##text
header_size = 24
paragraph_size = 14
^^ = header
.. = paragraph
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

### 4. Letter wrappers

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

### 5. Text wrappers (under `##text`)

Define wrappers that apply CSS classes instead of colors.

```
##text
^^ = header
.. = paragraph
```

Usage:

```
^This becomes a header^
.This becomes a paragraph.
```

The plugin ships with built-in styles for `header` and `paragraph`:

| Class | Effect |
|---|---|
| `.rv-header` | Bold text, sized by `--header_size` (default `1.5em`) |
| `.rv-paragraph` | Normal text, sized by `--paragraph_size` (default `1em`) |

You can define any value and style it with a CSS snippet targeting `.rv-{value}`.

### 6. CSS variables

Alphanumeric keys with underscores or hyphens become CSS variables:

```
header_size = 24
paragraph_size = 14
```

These become `--header_size: 24px` and `--paragraph_size: 14px` on the document container. The built-in `.rv-header` and `.rv-paragraph` classes reference these variables.

### 7. Dash-level outliner

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
