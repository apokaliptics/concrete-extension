import { App, Modal, Setting } from "obsidian";

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  varsBlock: string;
}

export const PRESETS: LayoutPreset[] = [
  {
    id: "classic-red-blue",
    name: "Classic Red & Blue",
    description: "Standard highlighting scheme with red and blue accents.",
    varsBlock: `:::vars
# Classic Red & Blue formatting scheme:
# - (text) : Vibrant Red color
# - "text" : Bright Blue color
# - ^text^ : Header text style

##colors
() = #ef4444
"" = #3b82f6

##text
header_size = 28
^^ = header
:::`
  },
  {
    id: "minimalist-mint",
    name: "Minimalist Mint",
    description: "Fresh green accents and clean body typography.",
    varsBlock: `:::vars
# Minimalist Mint formatting scheme:
# - (text) : Mint Green color
# - "text" : Muted gray color
# - ^text^ : Title text style (large)
# - .text. : Body text style (small)

##colors
() = #10b981
"" = #6b7280

##text
text_title_size = 30
text_body_size = 15
title = ^^
body = ..
:::`
  },
  {
    id: "royal-purple",
    name: "Royal Purple & Gold",
    description: "Sophisticated purple headers and amber highlights.",
    varsBlock: `:::vars
# Royal Purple & Gold formatting scheme:
# - hh text hh : Purple accent color
# - && text && : Gold accent color
# - ^text^     : Large section header style
# - __text__   : Bold text style

##colors
hh = #8b5cf6
&& = #f59e0b

##text
text_header_size = 36
^^ = header
__ = bold
:::`
  },
  {
    id: "academic-vars",
    name: "Academic & Research",
    description: "LaTeX-inspired structured layout with crimson, slate, and forest tones.",
    varsBlock: `:::vars
# Academic & Research formatting scheme:
# - gy [text] gy : Slate Gray (citations, source references, metadata)
# - rd [text] rd : Deep Crimson (core terms, key definitions, concepts)
# - gr [text] gr : Forest Green (supporting evidence, equations, results)
# - ^[text]^     : Document section header
# - __[text]__   : Bold text emphasis

##colors
gy = #475569
rd = #991b1b
gr = #166534

##text
text_header_size = 28
text_body_size = 15
^^ = header
__ = bold
:::`
  },
  {
    id: "formal-vars",
    name: "Formal & Executive",
    description: "Professional, clean styling with corporate teal, slate, and indigo accents.",
    varsBlock: `:::vars
# Formal & Executive formatting scheme:
# - cy [text] cy : Deep Teal (main action items, core objectives)
# - gy [text] gy : Cool Slate Gray (secondary context, side notes)
# - bl [text] bl : Deep Indigo (deadlines, owners, key priorities)
# - ^[text]^     : Clean, professional header
# - __[text]__   : Bold text emphasis

##colors
cy = #0f766e
gy = #64748b
bl = #4338ca

##text
text_header_size = 26
text_body_size = 14
^^ = header
__ = bold
:::`
  },
  {
    id: "cozy-journal",
    name: "Cozy Journal",
    description: "Soft terracotta, sage green, and warm amber tones for daily notes.",
    varsBlock: `:::vars
# Cozy Journal formatting scheme:
# - or [text] or : Warm Terracotta (emotional highlights, key events)
# - gr [text] gr : Sage Green (thoughts, reflections, soft text)
# - br [text] br : Warm Amber (ideas, side notes, epiphanies)
# - ^[text]^     : Warm header style
# - __[text]__   : Italic text emphasis

##colors
or = #c2410c
gr = #15803d
br = #b45309

##text
text_header_size = 24
text_body_size = 16
^^ = header
__ = italic
:::`
  },
  {
    id: "tech-log",
    name: "Developer & Tech Log",
    description: "High-contrast syntax colors for debugging logs and documentation.",
    varsBlock: `:::vars
# Developer & Tech Log formatting scheme:
# - cy [text] cy : Neon Cyan (variable names, functions, parameters)
# - or [text] or : Tangerine Orange (strings, literal values, outputs)
# - pi [text] pi : Orchid Pink (bug notes, warnings, errors)
# - ^[text]^     : Section subtitle header
# - __[text]__   : Bold text emphasis

##colors
cy = #06b6d4
or = #f97316
pi = #ec4899

##text
text_header_size = 28
^^ = header
__ = bold
:::`
  },
  {
    id: "spatial-brainstorm",
    name: "Spatial Brainstorming & Mindmap",
    description: "Designed for spatial notes with custom sticky color/size and lilac theme.",
    varsBlock: `:::vars
# Spatial Brainstorming scheme:
# - pi [text] pi : Orchid Purple (core concepts, central ideas)
# - bl [text] bl : Deep Indigo (connections, secondary nodes)
# - ^[text]^     : Large mindmap title/header
# - Default sticky notes: Soft Lavender background (#fae8ff) with purple text

##colors
pi = #d946ef
bl = #4f46e5

##text
text_header_size = 30
^^ = header

#notes
text_size = 13
text_colour = #4a044e
note_size = 160
note_colour = #fae8ff
:::`
  }
];

export class LayoutPresetModal extends Modal {
  constructor(app: App, private onSelect: (preset: LayoutPreset) => void) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl("h2", { text: "Select a layout preset", cls: "modal-title" });
    contentEl.createEl("p", { text: "Choose a pre-configured variable scheme to instantly format your document. The vars block will be inserted at the top of your note." });

    let selectedId = PRESETS[0] ? PRESETS[0].id : "";

    new Setting(contentEl)
      .setName("Preset scheme")
      .setDesc("The structural layout style to apply.")
      .addDropdown((dropdown) => {
        for (const preset of PRESETS) {
          dropdown.addOption(preset.id, preset.name);
        }
        dropdown.setValue(selectedId);
        dropdown.onChange((val) => {
          selectedId = val;
        });
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Apply preset")
          .setCta()
          .onClick(() => {
            const preset = PRESETS.find(p => p.id === selectedId);
            if (preset) {
              this.onSelect(preset);
            }
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
