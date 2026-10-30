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

### Python-adjacent `##commands` rule engine

- **Python-style indentation & syntax** — Write rules using standard `:` syntax with single-line or multi-line indented blocks (4 spaces or Tab):
  ```python
  if line[0] == ">":
      bl
      ft2
  ```
- **Built-in context variables** — Direct inspection of document text without regex boilerplate:
  - `line` — Line string (supports indexing `line[0]`, slicing `line[:3]`, and `line.raw`).
  - `words` — Whitespace-separated token array (`words[0]`, `words[-1]`, `len(words)`).
  - `span` — Inner text of the current inline tag (`"hello world"` in `rd hello world rd`).
  - `line_num` — 1-based note line number.
- **Safe indexing guarantee** — Accessing `line[0]` or `words[0]` on empty lines safely yields `""` instead of raising exceptions or breaking the editor.
- **Partial line & slice styling (`=`)** — Target specific slices of a line rather than styling the whole line:
  ```python
  line[0] = rd                      # Style only first character
  words[0] = bl, ft2                # Style only first word
  line["(" : ")"] = gr              # Delimiter slice shorthand
  line[:line.find(":") + 1] = rd    # Dynamic prefix styling
  ```
- **Rich comparisons & string methods** — Use `and`, `or`, `not`, `in`, `not in`, chained comparisons (`1 <= len(words) <= 4`), and string methods (`startswith`, `endswith`, `find`, `count`, `lower`, `upper`, `strip`).
- **Branching & nested conditions** — Full `if` / `elif` / `else` chains and nested indentation blocks.
- **Loops & style presets** — Define style bundles with `+` (`callout = bl + ft2`) and unroll loops over lists, tuples, or `range()`:
  ```python
  for col, font in [(rd, ft1), (bl, ft2)]:
      if col: font
  ```
- **Transitive style cascades** — Automatically cascades triggered styles up to 5 fixed-point passes (e.g. `if line[0] == "-": bl` cascades into `if bl: ft2`).
- **Style negation (`-style`)** — Remove or cancel earlier active styles in specific branches using `-style` (e.g., `-rd`).
- **Smart indentation keymap** — Inside `:::vars` under `##commands`, `Tab` inserts 4 spaces, `Shift-Tab` dedents, and `Enter` preserves or auto-indents after `:`.
- **100% legacy backward compatible** — Existing `if bl then ft2` and `if line 0 "(" + number + ")" then rd` rules continue to work seamlessly.

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

### 5. Declarative commands (`##commands`)

Under the `##commands` section, you can write expressive, indentation-aware rules using a Python-adjacent syntax to dynamically style lines, slices, and tokens without combinatorial variable bloat.

#### 5.1. Basic variable-to-variable linking (`if`)

Link colors, typography bundles, or size properties to one or more targets using `:` (single-line or indented block). Legacy `then` is fully supported as an alias for `:`.

```python
##commands
# Single-line syntax
if rd: ft1
if bl: ft2, text_ft4_size

# Multi-line indented syntax (using Tab or 4 spaces)
if gr:
    ft3
    paragraph_size

# Legacy syntax (100% backward-compatible)
if rd then ft1
```

#### 5.2. Built-in context objects

The rule engine exposes four built-in variables representing the line or token being evaluated:

| Variable | Type | Description | Examples |
|---|---|---|---|
| `line` | `String` | Text of the current line (excluding leading indentation). Use `line.raw` for the unstripped line. | `line[0]`, `line[:3]`, `line[-1]` |
| `words` | `List[String]` | Whitespace-separated tokens on the line. | `words[0]`, `words[-1]`, `len(words)` |
| `span` | `String` | Inner text of the tag being styled when evaluating inline wrappers (e.g. `rd hello rd` &rarr; `span = "hello"`). | `"!" in span` |
| `line_num` | `Number` | 1-based note line number. | `line_num % 2 == 0` |

> **Safe Indexing Guarantee:** Slicing or indexing empty lines or lists (`line[0]` on an empty line or `words[0]` on a blank line) **never throws an error**. It safely returns `""` so the editor never stutters while typing.

#### 5.3. Character & list slicing (`[start:stop:step]`)

Inspect exact character positions, prefixes, suffixes, or words using Python slice notation:

```python
##commands
# Character positions (0 = first character, -1 = last character)
if line[0] == ">": text_ft4_font
if line[-1] == ":": bl, ft2

# Enclosed line check (starts with "(" and ends with ")")
if line[0] == "(" and line[-1] == ")": rd

# Prefix and suffix slicing
if line[:2] == "- ": text_ft1_font
if line[:3] == "###": gr, ft3
if line[-3:] == "...": rd

# Word-level indexing
if words[0] == "NOTE:": bl, ft2
if words[-1] == "DONE": gr
```

#### 5.4. Partial line & slice styling (Target assignment `=`)

By default, writing `if line[0] == ">": rd` applies `rd` to the entire line. To style only a specific slice, word, or delimited segment, assign styles directly to the target slice using `=`:

```python
##commands
# Style ONLY the first character '>' in red, whole line gets ft4
if line[0] == ">":
    ft4
    line[0] = rd

# Style only the first word of a bullet list item
if line[:2] == "- ":
    words[1] = rd, ft1

# Style dynamic text before a colon (e.g., "Author: John Doe" -> "Author:" in blue ft2)
if ":" in line:
    line[:line.find(":") + 1] = bl, ft2

# Delimiter Slice Shorthand: styles any substring enclosed in "(" and ")" on the line
if "(" in line and ")" in line:
    line["(" : ")"] = rd, ft2
```

#### 5.5. Booleans, membership (`in`), and string methods

Combine complex rules with standard logical and membership operators:

* **Logical operators:** `and`, `or`, `not`
* **Membership operators:** `in`, `not in`
* **Comparison operators:** `==`, `!=`, `<`, `>`, `<=`, `>=` (including chained comparisons like `1 <= len(words) <= 4`)
* **Built-in helpers & methods:**
  - `len(x)` — Character length of `line`/`span` or token count of `words`.
  - `line.startswith("...")`, `line.endswith("...")`
  - `line.find("...")`, `line.count("...")`
  - `line.lower()`, `line.upper()`, `line.strip()`

```python
##commands
# Substring membership
if "TODO" in line or "FIXME" in line:
    rd, ft1

# List membership
if words[0] in ["WARNING:", "ERROR:", "CRITICAL:"]:
    rd, ft2, text_ft4_size

# Heading-like detection via word count
if 1 <= len(words) <= 4 and line[-1] != ".":
    bl, text_ft4_size

# Inline span check (only applies ft4 if the tagged word contains '!')
if rd and "!" in span:
    text_ft4_size
```

#### 5.6. Branching & indentation (`if` / `elif` / `else`)

Structure conditional styles with indentation (Tab or 4 spaces):

```python
##commands
if line[:2] == "# ":
    rd, ft1, text_ft4_size
elif line[0] == ">":
    bl, ft2
    # Nested condition:
    if "!" in line:
        rd
    elif "?" in line:
        gr
elif line[0] == "-":
    text_ft1_font
else:
    ft3, paragraph_size
```

#### 5.7. Loops, style presets, and style negation

Define reusable style bundles with `+` and generate repetitive rules with `for` loops:

```python
##commands
# 1. Reusable style presets
callout = bl + ft2 + text_ft4_size
danger = rd + ft1

if line[0] == ">": callout
if "URGENT" in line: danger

# 2. Batch-link colors to fonts with tuple unpacking
for col, font in [(rd, ft1), (bl, ft2), (gr, ft3)]:
    if col: font

# 3. Match multiple prefixes cleanly
for sym in [">", "|", "!"]:
    if line[0] == sym:
        callout
        line[0] = rd

# 4. Numbered list prefixes using range() and f-strings
for n in range(1, 10):
    if line[:2] == f"{n}.":
        ft1
        line[:2] = bl

# 5. Style negation (-style)
if line[0] == "!":
    callout
    -bl         # Removes bl from callout preset
    rd          # Replaces with rd
```

#### 5.8. Cascades & prefix bundle resolution

* **Transitive cascades:** Evaluates rules in up to 5 fixed-point passes. If Rule 1 sets `if line[0] == "(": rd` and Rule 2 sets `if rd: ft1`, a line starting with `(` receives both `rd` and `ft1`.
* **Prefix bundle resolution:** Declaring `text_ft1_font = Inter` and `text_ft1_size = 20` creates a bundle named `ft1`. Referencing `ft1` applies all bundled properties, while `text_ft1_font` or dot access `ft1.font` targets only that specific property.

#### 5.9. Smart editor indentation

When writing inside a `:::vars` block under the `##commands` section:
- **`Tab`** inserts 4 spaces instead of jumping focus or indenting the note.
- **`Shift-Tab`** dedents the line by up to 4 spaces or 1 tab.
- **`Enter`** automatically carries over the current indentation and indents an extra 4 spaces if the line ends with `:` or `then`.

#### 5.10. Legacy command syntax reference

All existing commands from earlier versions continue to operate with 100% backward compatibility:

```markdown
##commands
# Word position matching
if line 0 "(" + number + ")" then rd
if line 0 word then rd

# Entire line styling
if line ">" then ft_quote

# Style chaining
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
