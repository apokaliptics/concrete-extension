# Concrete Extension

A keyboard-first reactive variable, declarative rule engine, and structural formatting system for Obsidian.

Define custom text wrappers, inline color styles, font families, declarative commands, CSS variables, and structural layouts directly inside your notes using a simple, readable syntax. Copy styled content to external apps and protect LaTeX from formatting collisions — all from a single `:::vars` block.

> [!WARNING]
> This plugin is currently in **Beta** and there may be bugs. If you encounter any issues, please report them on the [GitHub Issues](https://github.com/apokaliptics/concrete-extension/issues) page.

---

## Features

### Core editor & reactive variables

- **Custom text wrappers** — Turn `(text)` red, `"text"` blue, or `^text^` into a bold header by defining a simple rule.
- **Letter & token wrappers** — Use alphanumeric tokens like `hh text hh` or `ft1 text ft1` for styling. Tokens are spaced from the content to avoid false matches with normal words.
- **Delimiter hiding** — Delimiter symbols are hidden in rendered view. Moving your cursor onto the line reveals the raw syntax.
- **Nested wrappers** — Combine multiple styles by nesting wrappers (e.g., `_&text&_`).
- **Combined styles** — Define the same wrapper in both `##colors` and `##text` to stack color *and* text styling simultaneously.
- **Interactive color palette** — Every hex color in your `:::vars` block gets a clickable swatch. Click to open the system color picker and update values inline.
- **CSS variable injection** — Declarations like `header_size = 24` or `text_ft1_font = Inter` become standard CSS variables (`--header_size: 24px`, `--text_ft1_font: 'Inter', sans-serif`) on the document container.

### Font variables in `##text`

- **Token font assignment** — Assign fonts to reusable tokens:
  ```yaml
  ##text
  ft1 = Inter
  codefont = JetBrains Mono
  text_quote_font = Merriweather
  ```
- **Inline token wrapping** — Wrap text directly with font tokens: `ft1 text in Inter ft1`.
- **Active note canvas font** — Define `font = <family>` (e.g., `font = Arial` or `font = "Space Grotesk"`) under `##text` to apply that font across the active note's editing canvas (`.cm-content`) and reading view (`.markdown-rendered`).
- **Smart fallback stacks** — Automatically resolves font fallback stacks (`monospace` for mono/code fonts, `serif` for serif families, and `sans-serif` otherwise).

### Declarative `##commands` rule engine

- **Word-level position matching** — Style words based on their position on a line:
  ```markdown
  if line 0 "(" + number + ")" then rd
  if line 0 word then rd
  ```
  Applies the target style (`rd`) strictly to the matched word/token at index `0` (`(1)`, `(2)`, etc.).
- **Entire line styling** — Apply styling across the entire line:
  ```markdown
  if line ">" then ft_quote
  if line 0 ">" then ft_quote
  if line word then ft_quote
  ```
  Applies the target style (e.g., `ft_quote` font) across the entire line whenever the condition is matched.
- **Style chaining** — Automatically attach secondary styles to primary rules:
  ```markdown
  if rd then ft1
  ```
  Whenever text is styled with `rd` (red), font `ft1` (`Inter`) is chained and applied as well.
- **Concatenation & pattern tokens** — Combine pattern tokens using `+`:
  - `number`: `\d+`
  - `word`: `\S+`
  - `alpha`: `[a-zA-Z]+`
  - `heading` / `#`: `#{1,6}`
  - `-` / `bullet`: `[-*+]`
  - `">"` / `quote`: `>`
  - String literals: `"..."` or `'...'` (e.g., `"("`, `")"`)

### Native list interception

- **Styled native bullets** — Standard `-` and `+` list markers are intercepted and replaced with aesthetic bullet characters (`•`, `◦`, `▸`, `▹`, `⁃`, `·`) per indent level.
- **Guide lines and fading opacity** — Deeper indent levels fade visually with guide lines for clear structural hierarchy.
- **Ghost bullet effect** — Styled bullets display on inactive lines; clicking into a line reveals the raw markers for editing.
- **Image-safe** — Lines containing image embeds (`![[...]]` or `![...](...)`) are preserved without list bullet modifications.

### Color autocomplete

- **Context-aware color picker** — Typing `#` on a color line inside a `:::vars` block triggers a floating swatch palette with 9 preset colors and a custom color picker button.
- **Auto-fill** — Selecting a swatch writes the hex value directly into your document.
- **Auto-dismiss** — The popup dismisses cleanly when the cursor moves away.

### Data portability and clipboard

- **Copy without variables** — Right-click menu option **Copy content without variables** strips all `:::vars` blocks and copies clean text.
- **Dual-flavor clipboard payload** — Standard copy (`Ctrl+C` / `Cmd+C`) preserves formatting across applications:
  - `text/plain`: Clean, variable-stripped markdown.
  - `text/html`: Compiled HTML with inline CSS (`<span style="...">`) so styles survive when pasting into external editors like Google Docs, Word, or web apps.

### Global configuration defaults & presets

- **Global vars block** — Define universal variable defaults in **Settings → Concrete**. Local `:::vars` blocks automatically inherit and override these defaults.
- **Layout presets** — Insert pre-configured schemes ("Classic Red & Blue", "Minimalist Mint", "Royal Purple & Gold", etc.) with the ribbon icon or **Insert layout preset** command.

### LaTeX protection

- **Parse-exclusion boundaries** — Math expressions (`$...$` and `$$...$$`) are protected from formatting collisions with LaTeX underscores, carets, or braces.

### High-performance viewport bounding

- Built for CodeMirror 6 with decorations strictly computed over `view.visibleRanges` for zero input latency even in massive documents.

---

## How to use

### 1. Create a `:::vars` block

Place a `:::vars` block anywhere in your note (usually at the top):

```yaml
:::vars
##colors
rd = #ef4444
bl = #3b82f6

##text
header_size = 28
text_ft1_font = Inter
ft_quote = Merriweather

##commands
if rd then ft1
if line 0 "(" + number + ")" then rd
if line ">" then ft_quote
:::
```

### 2. Sections

Sections are defined by `##` headers:

| Section | Purpose |
|---|---|
| `##colors` (or `##colour`, `##colours`) | Color definitions. Keys are wrapper tokens, values are hex codes or color names. |
| `##text` | Text sizes, typography, font family variables, and style aliases. |
| `##commands` | Declarative formatting directives (`if ... then ...`). |

### 3. Color variables & shortcuts

Assign hex codes or built-in abbreviations under `##colors`:

```yaml
##colors
() = #ef4444
"" = #3b82f6
rd = #FF0000
gn = #00FF00
bl = #0000FF
```

Supported shortcuts:
- `hp` / `black` &rarr; `#000000`
- `wt` / `white` &rarr; `#FFFFFF`
- `rd` / `red` &rarr; `#FF0000`
- `gn` / `green` &rarr; `#00FF00`
- `bl` / `blue` &rarr; `#0000FF`
- `yl` / `yellow` &rarr; `#FFFF00`
- `mg` / `magenta` &rarr; `#FF00FF`
- `cy` / `cyan` &rarr; `#00FFFF`
- `or` / `orange` &rarr; `#FFA500`
- `pl` / `purple` &rarr; `#800080`
- `pr` / `pink` &rarr; `#FFC0CB`
- `tl` / `teal` &rarr; `#008080`
- `br` / `brown` &rarr; `#A52A2A`

### 4. Typography & font variables

Define font families and sizes under `##text`:

```yaml
##text
# Note-wide canvas font
font = Arial

# Font variables
ft1 = Inter
text_code_font = JetBrains Mono
ft_quote = Merriweather

# Size variables
header_size = 28
text_title_size = 32

# Style aliases
^^ = header
__ = bold
```

Use in text:
```markdown
ft1 This text will render in Inter ft1
^^This will render as a large header^^
```

### 5. Declarative commands

Automate styling with declarative rules under `##commands`:

```yaml
##commands
# Style first word matching pattern (1), (2), etc. in red
if line 0 "(" + number + ")" then rd

# Style the first word of any line in red
if line 0 word then rd

# Style entire blockquote lines in Merriweather font
if line ">" then ft_quote

# Style chaining: wherever rd is applied, also apply ft1 font
if rd then ft1
```

---

## Settings

- **Core configuration**:
  - **Enable editor features** — Inline values, completions, and editor styling.
  - **Enable preview substitutions** — Applies styling in Reading View.
  - **Global layout preset** — Apply a pre-configured scheme vault-wide.
  - **Global configuration defaults** — Universal vars block across all notes.
- **Editor behaviors**:
  - **Use bullet points** — Toggle native list interception and aesthetic bullets.
  - **Use colour variables** — Enable color wrappers and swatches.
  - **Use text variables** — Enable typography wrappers and font variables.

---

## Installation

### Community plugins
1. Open **Settings → Community plugins** in Obsidian.
2. Search for **Concrete**.
3. Click **Install**, then **Enable**.

### Manual installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Latest Release](https://github.com/apokaliptics/concrete-extension/releases).
2. Create folder `VaultFolder/.obsidian/plugins/concrete/`.
3. Place `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian and enable **Concrete** in **Settings → Community plugins**.

### Development
```bash
git clone https://github.com/apokaliptics/concrete-extension.git
cd concrete-extension
npm install
npm run dev     # Watch mode
npm run build   # Production bundle
npm run lint    # ESLint verification
```

---

## License

MIT © apokaliptics
