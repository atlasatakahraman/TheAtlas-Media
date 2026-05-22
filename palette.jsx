import { useState } from "react";

// ─── Palette extracted from scheme.json + sequences.txt ───────────────────────
const PALETTE = {
  // Core
  bg:      "#fdf8f5",
  fg:      "#1c1b1a",
  cursor:  "#625e56",

  // Surfaces
  surfaceLowest:  "#ffffff",
  surfaceLow:     "#f7f3f0",
  surface:        "#f2edea",
  surfaceHigh:    "#ece7e4",
  surfaceHighest: "#e6e2df",
  surfaceDim:     "#ddd9d6",
  surfaceVariant: "#e8e2d6",
  base:    "#fdf8f5",
  mantle:  "#f4f0ee",
  crust:   "#eeeae9",

  // Primary (from scheme.json "primary": "3b3628")
  primary:            "#3b3628",
  primaryDim:         "#575242",
  onPrimary:          "#ffffff",
  primaryContainer:   "#524d3d",
  onPrimaryContainer: "#c6beaa",
  inversePrimary:     "#cec6b1",
  primaryFixed:       "#eae2cd",
  primaryFixedDim:    "#cec6b1",
  onPrimaryFixed:     "#1f1b0e",
  onPrimaryFixedVar:  "#4b4737",
  surfaceTint:        "#645e4d",

  // Secondary (from scheme.json "secondary": "625e56")
  secondary:            "#625e56",
  secondaryDim:         "#55524a",
  onSecondary:          "#ffffff",
  secondaryContainer:   "#e8e2d7",
  onSecondaryContainer: "#68645c",
  secondaryFixed:       "#e8e2d7",
  secondaryFixedDim:    "#cbc6bc",
  onSecondaryFixed:     "#1d1b15",
  onSecondaryFixedVar:  "#4a463f",

  // Tertiary (from scheme.json "tertiary": "38353f")
  tertiary:            "#38353f",
  tertiaryDim:         "#54515b",
  onTertiary:          "#ffffff",
  tertiaryContainer:   "#4f4c56",
  onTertiaryContainer: "#c2bdc9",
  tertiaryFixed:       "#e6e0ed",
  tertiaryFixedDim:    "#cac4d0",
  onTertiaryFixed:     "#1c1a23",
  onTertiaryFixedVar:  "#48454f",

  // Error
  error:            "#ba1a1a",
  onError:          "#ffffff",
  errorContainer:   "#ffdad6",
  onErrorContainer: "#93000a",

  // Success
  success:            "#4f6354",
  onSuccess:          "#ffffff",
  successContainer:   "#d1e8d5",
  onSuccessContainer: "#0c1f13",

  // Outline
  outline:        "#7b776d",
  outlineVariant: "#ccc6bb",

  // Inverse
  inverseSurface:   "#31302e",
  inverseOnSurface: "#f4f0ed",

  // Text hierarchy
  text:      "#1c1b1a",
  subtext1:  "#4a473e",
  subtext0:  "#7b776d",
  overlay2:  "#8b877e",
  overlay1:  "#9c9890",
  overlay0:  "#ada9a2",
  surface2:  "#bfbbb5",
  surface1:  "#d2cec8",
  surface0:  "#e8e3df",

  // Catppuccin-style accents
  rosewater: "#9b782c",
  flamingo:  "#9a6e00",
  pink:      "#ab7100",
  mauve:     "#8f3b00",
  red:       "#6f4e00",
  maroon:    "#855f00",
  peach:     "#957000",
  yellow:    "#9a7a00",
  green:     "#787100",
  teal:      "#636e1c",
  sky:       "#4b882e",
  sapphire:  "#697a22",
  blue:      "#00664e",
  lavender:  "#c2484e",

  // KDE semantic
  klink:             "#559652",
  kvisited:          "#c06b00",
  knegative:         "#b47d00",
  kneutralSelection: "#d2a500",
  kneutral:          "#d8a200",
  kpositive:         "#b7ac00",

  // ANSI 0–15 (from sequences.txt & scheme.json term0–term15)
  t0:  "#9e9a95",  // black
  t1:  "#815900",  // red
  t2:  "#8d8200",  // green
  t3:  "#8d6a00",  // yellow
  t4:  "#a0871a",  // blue
  t5:  "#916000",  // magenta
  t6:  "#7a8734",  // cyan
  t7:  "#27211d",  // white
  t8:  "#0f0f0e",  // bright black
  t9:  "#9f6f00",  // bright red
  t10: "#afa221",  // bright green
  t11: "#ae8516",  // bright yellow
  t12: "#c5aa3d",  // bright blue
  t13: "#b47800",  // bright magenta
  t14: "#9aa751",  // bright cyan
  t15: "#2e2723",  // bright white
};

const SWATCHES = [
  { label: "base",      hex: PALETTE.base },
  { label: "crust",     hex: PALETTE.crust },
  { label: "surface0",  hex: PALETTE.surface0 },
  { label: "surface",   hex: PALETTE.surface },
  { label: "subtext0",  hex: PALETTE.subtext0 },
  { label: "subtext1",  hex: PALETTE.subtext1 },
  { label: "text",      hex: PALETTE.text },
  { label: "primary",   hex: PALETTE.primary },
  { label: "primaryDim",hex: PALETTE.primaryDim },
  { label: "secondary", hex: PALETTE.secondary },
  { label: "tertiary",  hex: PALETTE.tertiary },
  { label: "rosewater", hex: PALETTE.rosewater },
  { label: "yellow",    hex: PALETTE.yellow },
  { label: "green",     hex: PALETTE.green },
  { label: "teal",      hex: PALETTE.teal },
  { label: "sky",       hex: PALETTE.sky },
  { label: "blue",      hex: PALETTE.blue },
  { label: "lavender",  hex: PALETTE.lavender },
  { label: "error",     hex: PALETTE.error },
];

const ANSI_SWATCHES = [
  { label: "black",      hex: PALETTE.t0  },
  { label: "red",        hex: PALETTE.t1  },
  { label: "green",      hex: PALETTE.t2  },
  { label: "yellow",     hex: PALETTE.t3  },
  { label: "blue",       hex: PALETTE.t4  },
  { label: "magenta",    hex: PALETTE.t5  },
  { label: "cyan",       hex: PALETTE.t6  },
  { label: "white",      hex: PALETTE.t7  },
  { label: "br.black",   hex: PALETTE.t8  },
  { label: "br.red",     hex: PALETTE.t9  },
  { label: "br.green",   hex: PALETTE.t10 },
  { label: "br.yellow",  hex: PALETTE.t11 },
  { label: "br.blue",    hex: PALETTE.t12 },
  { label: "br.magenta", hex: PALETTE.t13 },
  { label: "br.cyan",    hex: PALETTE.t14 },
  { label: "br.white",   hex: PALETTE.t15 },
];

const CONFIGS = {
  "CSS Variables": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  CSS Custom Properties                   ║
   ║  Usable in any web project               ║
   ╚══════════════════════════════════════════╝ */

:root {
  /* ─── Core ─────────────────────────────── */
  --cl-bg:                    #fdf8f5;
  --cl-fg:                    #1c1b1a;
  --cl-cursor:                #625e56;

  /* ─── Surfaces ──────────────────────────── */
  --cl-surface-lowest:        #ffffff;
  --cl-surface-low:           #f7f3f0;
  --cl-surface:               #f2edea;
  --cl-surface-high:          #ece7e4;
  --cl-surface-highest:       #e6e2df;
  --cl-surface-dim:           #ddd9d6;
  --cl-surface-variant:       #e8e2d6;
  --cl-base:                  #fdf8f5;
  --cl-mantle:                #f4f0ee;
  --cl-crust:                 #eeeae9;
  --cl-surface-tint:          #645e4d;

  /* ─── Primary ───────────────────────────── */
  --cl-primary:               #3b3628;
  --cl-primary-dim:           #575242;
  --cl-on-primary:            #ffffff;
  --cl-primary-container:     #524d3d;
  --cl-on-primary-container:  #c6beaa;
  --cl-inverse-primary:       #cec6b1;
  --cl-primary-fixed:         #eae2cd;
  --cl-primary-fixed-dim:     #cec6b1;
  --cl-on-primary-fixed:      #1f1b0e;
  --cl-on-primary-fixed-var:  #4b4737;

  /* ─── Secondary ─────────────────────────── */
  --cl-secondary:             #625e56;
  --cl-secondary-dim:         #55524a;
  --cl-on-secondary:          #ffffff;
  --cl-secondary-container:   #e8e2d7;
  --cl-on-secondary-container:#68645c;
  --cl-secondary-fixed:       #e8e2d7;
  --cl-secondary-fixed-dim:   #cbc6bc;
  --cl-on-secondary-fixed:    #1d1b15;
  --cl-on-secondary-fixed-var:#4a463f;

  /* ─── Tertiary ──────────────────────────── */
  --cl-tertiary:              #38353f;
  --cl-tertiary-dim:          #54515b;
  --cl-on-tertiary:           #ffffff;
  --cl-tertiary-container:    #4f4c56;
  --cl-on-tertiary-container: #c2bdc9;
  --cl-tertiary-fixed:        #e6e0ed;
  --cl-tertiary-fixed-dim:    #cac4d0;
  --cl-on-tertiary-fixed:     #1c1a23;
  --cl-on-tertiary-fixed-var: #48454f;

  /* ─── Text Hierarchy ────────────────────── */
  --cl-text:                  #1c1b1a;
  --cl-subtext1:              #4a473e;
  --cl-subtext0:              #7b776d;
  --cl-overlay2:              #8b877e;
  --cl-overlay1:              #9c9890;
  --cl-overlay0:              #ada9a2;
  --cl-surface2:              #bfbbb5;
  --cl-surface1:              #d2cec8;
  --cl-surface0:              #e8e3df;

  /* ─── Outline ───────────────────────────── */
  --cl-outline:               #7b776d;
  --cl-outline-variant:       #ccc6bb;

  /* ─── Error ─────────────────────────────── */
  --cl-error:                 #ba1a1a;
  --cl-on-error:              #ffffff;
  --cl-error-container:       #ffdad6;
  --cl-on-error-container:    #93000a;

  /* ─── Success ───────────────────────────── */
  --cl-success:               #4f6354;
  --cl-on-success:            #ffffff;
  --cl-success-container:     #d1e8d5;
  --cl-on-success-container:  #0c1f13;

  /* ─── Inverse ───────────────────────────── */
  --cl-inverse-surface:       #31302e;
  --cl-inverse-on-surface:    #f4f0ed;

  /* ─── Accents (Catppuccin-style) ────────── */
  --cl-rosewater:             #9b782c;
  --cl-flamingo:              #9a6e00;
  --cl-pink:                  #ab7100;
  --cl-mauve:                 #8f3b00;
  --cl-red:                   #6f4e00;
  --cl-maroon:                #855f00;
  --cl-peach:                 #957000;
  --cl-yellow:                #9a7a00;
  --cl-green:                 #787100;
  --cl-teal:                  #636e1c;
  --cl-sky:                   #4b882e;
  --cl-sapphire:              #697a22;
  --cl-blue:                  #00664e;
  --cl-lavender:              #c2484e;

  /* ─── Terminal ANSI 0–15 ────────────────── */
  --cl-ansi-black:            #9e9a95;
  --cl-ansi-red:              #815900;
  --cl-ansi-green:            #8d8200;
  --cl-ansi-yellow:           #8d6a00;
  --cl-ansi-blue:             #a0871a;
  --cl-ansi-magenta:          #916000;
  --cl-ansi-cyan:             #7a8734;
  --cl-ansi-white:            #27211d;
  --cl-ansi-br-black:         #0f0f0e;
  --cl-ansi-br-red:           #9f6f00;
  --cl-ansi-br-green:         #afa221;
  --cl-ansi-br-yellow:        #ae8516;
  --cl-ansi-br-blue:          #c5aa3d;
  --cl-ansi-br-magenta:       #b47800;
  --cl-ansi-br-cyan:          #9aa751;
  --cl-ansi-br-white:         #2e2723;

  /* ─── Link / KDE-style semantic ─────────── */
  --cl-link:                  #559652;
  --cl-link-visited:          #c06b00;
  --cl-negative:              #b47d00;
  --cl-neutral:               #d8a200;
  --cl-positive:              #b7ac00;
}`,

  "userChrome.css": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  Firefox userChrome.css                  ║
   ║  Path: ~/.mozilla/firefox/<profile>/     ║
   ║         chrome/userChrome.css            ║
   ║  Requires:                               ║
   ║    toolkit.legacyUserProfileCustom-      ║
   ║    izations.stylesheets = true           ║
   ╚══════════════════════════════════════════╝ */

:root {
  /* Core chrome tokens */
  --toolbar-bgcolor:                  #fdf8f5 !important;
  --toolbar-color:                    #1c1b1a !important;
  --toolbarbutton-hover-background:   #e8e2d7 !important;
  --toolbarbutton-active-background:  #ddd9d6 !important;

  /* URL bar */
  --urlbar-background:                #f2edea !important;
  --urlbar-popup-url-color:           #00664e !important;
  --urlbar-popup-action-color:        #636e1c !important;

  /* Tabs */
  --tabs-border-color:                #ccc6bb !important;
  --tab-selected-bgcolor:             #fdf8f5 !important;
  --tab-hover-background:             #ece7e4 !important;
  --tab-loading-fill:                 #3b3628 !important;

  /* Sidebar */
  --sidebar-background-color:         #f7f3f0 !important;
  --sidebar-text-color:               #1c1b1a !important;
  --sidebar-border-color:             #ccc6bb !important;

  /* Panels / popups */
  --arrowpanel-background:            #fdf8f5 !important;
  --arrowpanel-color:                 #1c1b1a !important;
  --arrowpanel-border-color:          #ccc6bb !important;
  --panel-item-hover-bgcolor:         #e8e2d7 !important;
  --panel-item-active-bgcolor:        #ddd9d6 !important;

  /* Buttons */
  --button-bgcolor:                   #f2edea !important;
  --button-hover-bgcolor:             #e8e2d7 !important;
  --button-active-bgcolor:            #ddd9d6 !important;
  --button-color:                     #1c1b1a !important;
  --button-primary-bgcolor:           #3b3628 !important;
  --button-primary-color:             #ffffff !important;
  --button-primary-hover-bgcolor:     #575242 !important;
  --button-primary-active-bgcolor:    #524d3d !important;

  /* Links & focus */
  --link-color:                       #00664e !important;
  --focus-outline-color:              #3b3628 !important;
  --attention-dot-color:              #9b782c !important;
}

/* ── Nav bar ──────────────────────────────────── */
#nav-bar {
  background-color: #fdf8f5 !important;
  border-bottom: 1px solid #ccc6bb !important;
}

/* ── Tab bar ──────────────────────────────────── */
#TabsToolbar {
  background-color: #f7f3f0 !important;
}

.tabbrowser-tab .tab-background[selected="true"] {
  background-color: #fdf8f5 !important;
  box-shadow: 0 2px 0 #3b3628 inset !important;
}

.tabbrowser-tab:hover .tab-background:not([selected="true"]) {
  background-color: #ece7e4 !important;
}

/* ── URL bar focused ──────────────────────────── */
#urlbar[focused="true"] .urlbar-input-container {
  background-color: #ffffff !important;
  box-shadow: 0 0 0 2px #3b3628 !important;
}

/* ── Bookmark bar ─────────────────────────────── */
#PersonalToolbar {
  background-color: #f2edea !important;
  border-bottom: 1px solid #e6e2df !important;
}

/* ── Menu bar ─────────────────────────────────── */
#toolbar-menubar {
  background-color: #f2edea !important;
}

/* ── Find bar ─────────────────────────────────── */
.findbar-container {
  background-color: #f2edea !important;
  border-top: 1px solid #ccc6bb !important;
}

/* ── Scrollbars ───────────────────────────────── */
scrollbar {
  --scrollbar-color: #ccc6bb transparent !important;
}`,

  "userContent.css": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  Firefox userContent.css                 ║
   ║  Path: ~/.mozilla/firefox/<profile>/     ║
   ║         chrome/userContent.css           ║
   ║  Themes web page chrome elements         ║
   ╚══════════════════════════════════════════╝ */

@-moz-document url-prefix() {
  :root {
    color-scheme: light;
  }
}

/* ── about:blank & about:newtab ─────────────── */
@-moz-document url("about:blank"),
               url("about:newtab"),
               url("about:home") {
  body {
    background-color: #fdf8f5 !important;
    color: #1c1b1a !important;
  }
}

/* ── PDF viewer ─────────────────────────────── */
@-moz-document url-prefix("about:reader") {
  body {
    --background-color:   #fdf8f5 !important;
    --foreground-color:   #1c1b1a !important;
    --toolbar-bgcolor:    #f2edea !important;
    --link-color:         #00664e !important;
    --visited-link-color: #c06b00 !important;
  }
}

/* ── Scrollbars (global) ────────────────────── */
* {
  scrollbar-color: #ccc6bb transparent !important;
  scrollbar-width: thin !important;
}

*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background-color: #ccc6bb;
  border-radius: 4px;
}
*::-webkit-scrollbar-thumb:hover {
  background-color: #7b776d;
}`,

  "Alacritty (TOML)": `# ╔══════════════════════════════════════════╗
# ║  AtlasAta - Caelestia Light              ║
# ║  Alacritty terminal                      ║
# ║  ~/.config/alacritty/alacritty.toml      ║
# ║  or import via: [[import]]               ║
# ║    path = "~/.config/alacritty/          ║
# ║             caelestia-light.toml"        ║
# ╚══════════════════════════════════════════╝

[colors]
draw_bold_text_with_bright_colors = true

[colors.primary]
background     = "#fdf8f5"
foreground     = "#1c1b1a"
dim_foreground = "#7b776d"

[colors.cursor]
cursor = "#625e56"
text   = "#fdf8f5"

[colors.vi_mode_cursor]
cursor = "#9b782c"
text   = "#fdf8f5"

[colors.search.matches]
foreground = "#fdf8f5"
background = "#3b3628"

[colors.search.focused_match]
foreground = "#fdf8f5"
background = "#9b782c"

[colors.hints.start]
foreground = "#fdf8f5"
background = "#9a7a00"

[colors.hints.end]
foreground = "#fdf8f5"
background = "#7b776d"

[colors.selection]
text       = "CellForeground"
background = "#e8e2d7"

[colors.footer_bar]
background = "#f2edea"
foreground = "#1c1b1a"

[colors.normal]
black   = "#9e9a95"
red     = "#815900"
green   = "#8d8200"
yellow  = "#8d6a00"
blue    = "#a0871a"
magenta = "#916000"
cyan    = "#7a8734"
white   = "#27211d"

[colors.bright]
black   = "#0f0f0e"
red     = "#9f6f00"
green   = "#afa221"
yellow  = "#ae8516"
blue    = "#c5aa3d"
magenta = "#b47800"
cyan    = "#9aa751"
white   = "#2e2723"

[colors.dim]
black   = "#ccc6bb"
red     = "#c5aa3d"
green   = "#b8b300"
yellow  = "#c09400"
blue    = "#c5aa3d"
magenta = "#c09400"
cyan    = "#a8ae6a"
white   = "#7b776d"`,

  "Kitty": `# ╔══════════════════════════════════════════╗
# ║  AtlasAta - Caelestia Light              ║
# ║  kitty terminal                          ║
# ║  Save as caelestia-light.conf            ║
# ║  In kitty.conf: include caelestia-light  ║
# ║  .conf  (or use kitty +kitten themes)    ║
# ╚══════════════════════════════════════════╝

# Core
background            #fdf8f5
foreground            #1c1b1a
selection_background  #e8e2d7
selection_foreground  #1c1b1a
url_color             #00664e
cursor                #625e56
cursor_text_color     #fdf8f5
cursor_beam_thickness 1.5

# Marks
mark1_foreground #fdf8f5
mark1_background #3b3628
mark2_foreground #fdf8f5
mark2_background #9b782c
mark3_foreground #fdf8f5
mark3_background #4b882e

# Tab bar
active_tab_background   #fdf8f5
active_tab_foreground   #1c1b1a
inactive_tab_background #ece7e4
inactive_tab_foreground #7b776d
tab_bar_background      #f2edea
tab_bar_edge            bottom

# Window borders
active_border_color     #3b3628
inactive_border_color   #ccc6bb
bell_border_color       #9b782c

# ANSI 0–7 (normal)
color0  #9e9a95
color1  #815900
color2  #8d8200
color3  #8d6a00
color4  #a0871a
color5  #916000
color6  #7a8734
color7  #27211d

# ANSI 8–15 (bright)
color8  #0f0f0e
color9  #9f6f00
color10 #afa221
color11 #ae8516
color12 #c5aa3d
color13 #b47800
color14 #9aa751
color15 #2e2723`,

  "foot": `# ╔══════════════════════════════════════════╗
# ║  AtlasAta - Caelestia Light              ║
# ║  foot terminal                           ║
# ║  ~/.config/foot/foot.ini                 ║
# ╚══════════════════════════════════════════╝

[colors]
background=fdf8f5
foreground=1c1b1a

selection-foreground=1c1b1a
selection-background=e8e2d7

search-box-no-match=fdf8f5 ba1a1a
search-box-match=fdf8f5 9b782c

jump-labels=fdf8f5 9a7a00
scrollback-indicator=fdf8f5 3b3628

urls=00664e

# ANSI 0–7 (normal)
regular0=9e9a95
regular1=815900
regular2=8d8200
regular3=8d6a00
regular4=a0871a
regular5=916000
regular6=7a8734
regular7=27211d

# ANSI 8–15 (bright)
bright0=0f0f0e
bright1=9f6f00
bright2=afa221
bright3=ae8516
bright4=c5aa3d
bright5=b47800
bright6=9aa751
bright7=2e2723`,

  "WezTerm (Lua)": `-- ╔══════════════════════════════════════════╗
-- ║  AtlasAta - Caelestia Light              ║
-- ║  WezTerm                                 ║
-- ║  ~/.config/wezterm/wezterm.lua           ║
-- ║  or split into a separate module         ║
-- ╚══════════════════════════════════════════╝

local wezterm = require("wezterm")

local M = {}

M.colors = {
  foreground          = "#1c1b1a",
  background          = "#fdf8f5",
  cursor_bg           = "#625e56",
  cursor_fg           = "#fdf8f5",
  cursor_border       = "#625e56",
  selection_fg        = "#1c1b1a",
  selection_bg        = "#e8e2d7",
  scrollbar_thumb     = "#ccc6bb",
  split               = "#ccc6bb",
  visual_bell         = "#9b782c",

  ansi = {
    "#9e9a95", -- black
    "#815900", -- red
    "#8d8200", -- green
    "#8d6a00", -- yellow
    "#a0871a", -- blue
    "#916000", -- magenta
    "#7a8734", -- cyan
    "#27211d", -- white
  },

  brights = {
    "#0f0f0e", -- bright black
    "#9f6f00", -- bright red
    "#afa221", -- bright green
    "#ae8516", -- bright yellow
    "#c5aa3d", -- bright blue
    "#b47800", -- bright magenta
    "#9aa751", -- bright cyan
    "#2e2723", -- bright white
  },

  tab_bar = {
    background = "#f2edea",
    active_tab = {
      bg_color  = "#fdf8f5",
      fg_color  = "#1c1b1a",
      intensity = "Normal",
    },
    inactive_tab = {
      bg_color  = "#ece7e4",
      fg_color  = "#7b776d",
    },
    inactive_tab_hover = {
      bg_color  = "#e8e2d7",
      fg_color  = "#1c1b1a",
    },
    new_tab = {
      bg_color  = "#f2edea",
      fg_color  = "#7b776d",
    },
    new_tab_hover = {
      bg_color  = "#e8e2d7",
      fg_color  = "#1c1b1a",
    },
  },
}

-- Usage:
-- config.colors = M.colors
-- Or register as named scheme:
-- config.color_schemes = { ["AtlasAta - Caelestia Light"] = M.colors }
-- config.color_scheme   = "AtlasAta - Caelestia Light"

return M`,

  "Windows Terminal": `{
  "name": "AtlasAta - Caelestia Light",
  "background": "#FDF8F5",
  "foreground": "#1C1B1A",
  "cursorColor": "#625E56",
  "selectionBackground": "#E8E2D7",
  "black":        "#9E9A95",
  "red":          "#815900",
  "green":        "#8D8200",
  "yellow":       "#8D6A00",
  "blue":         "#A0871A",
  "purple":       "#916000",
  "cyan":         "#7A8734",
  "white":        "#27211D",
  "brightBlack":   "#0F0F0E",
  "brightRed":     "#9F6F00",
  "brightGreen":   "#AFA221",
  "brightYellow":  "#AE8516",
  "brightBlue":    "#C5AA3D",
  "brightPurple":  "#B47800",
  "brightCyan":    "#9AA751",
  "brightWhite":   "#2E2723"
}`,

  "Konsole / Yakuake": `[General]
Description=AtlasAta - Caelestia Light
Opacity=1

[Background]
Color=253,248,245

[BackgroundFaint]
Color=244,240,238

[BackgroundIntense]
Color=255,255,255

[Foreground]
Color=28,27,26

[ForegroundFaint]
Color=123,119,109

[ForegroundIntense]
Color=28,27,26

[Color0]
Color=158,154,149

[Color0Faint]
Color=204,198,187

[Color0Intense]
Color=15,15,14

[Color1]
Color=129,89,0

[Color1Faint]
Color=197,170,61

[Color1Intense]
Color=159,111,0

[Color2]
Color=141,130,0

[Color2Faint]
Color=175,162,33

[Color2Intense]
Color=175,162,33

[Color3]
Color=141,106,0

[Color3Faint]
Color=197,170,61

[Color3Intense]
Color=174,133,22

[Color4]
Color=160,135,26

[Color4Faint]
Color=197,170,61

[Color4Intense]
Color=197,170,61

[Color5]
Color=145,96,0

[Color5Faint]
Color=180,120,0

[Color5Intense]
Color=180,120,0

[Color6]
Color=122,135,52

[Color6Faint]
Color=154,167,81

[Color6Intense]
Color=154,167,81

[Color7]
Color=39,33,29

[Color7Faint]
Color=123,119,109

[Color7Intense]
Color=46,39,35`,

  "Hyprland": `# ╔══════════════════════════════════════════╗
# ║  AtlasAta - Caelestia Light              ║
# ║  Hyprland                                ║
# ║  In hyprland.conf (or a sourced file)    ║
# ║  source = ~/.config/hypr/                ║
# ║             caelestia-light.conf         ║
# ╚══════════════════════════════════════════╝

general {
  col.active_border    = rgba(3b3628ff) rgba(9b782cff) 45deg
  col.inactive_border  = rgba(ccc6bbff)
  col.nogroup_border   = rgba(7b776dff)
  col.nogroup_border_active = rgba(3b3628ff)
}

decoration {
  col.shadow           = rgba(1c1b1a26)
  col.shadow_inactive  = rgba(1c1b1a10)
}

# ── hyprlock ──────────────────────────────────
# $cl_bg      = rgb(fdf8f5)
# $cl_fg      = rgb(1c1b1a)
# $cl_surface = rgb(f2edea)
# $cl_primary = rgb(3b3628)
# $cl_outline = rgb(ccc6bb)
# $cl_error   = rgb(ba1a1a)
# $cl_sub     = rgb(7b776d)

# background {
#   color = $cl_bg
# }
#
# input-field {
#   outer_color   = $cl_outline
#   inner_color   = $cl_surface
#   font_color    = $cl_fg
#   check_color   = $cl_primary
#   fail_color    = $cl_error
#   placeholder_text = <span foreground="##7b776d">Password...</span>
# }
#
# label {   # clock
#   color = $cl_fg
# }

# ── hypridle (indicator colours) ──────────────
# listener {
#   timeout = 300
#   on-timeout  = hyprlock
#   on-resume   = notify-send "Welcome back"
# }

# ── Waybar hint ───────────────────────────────
# In style.css, reference these tokens:
#   background-color: #f2edea;
#   color:            #1c1b1a;
#   border-color:     #ccc6bb;
#   /* accent */      #3b3628;`,

  "GTK CSS": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  GTK3: ~/.config/gtk-3.0/gtk.css         ║
   ║  GTK4: ~/.config/gtk-4.0/gtk.css         ║
   ╚══════════════════════════════════════════╝ */

@define-color accent_color           #3b3628;
@define-color accent_bg_color        #3b3628;
@define-color accent_fg_color        #ffffff;

@define-color destructive_color      #ba1a1a;
@define-color destructive_bg_color   #ffdad6;
@define-color destructive_fg_color   #93000a;

@define-color success_color          #4f6354;
@define-color success_bg_color       #d1e8d5;
@define-color success_fg_color       #0c1f13;

@define-color warning_color          #9a7a00;
@define-color warning_bg_color       #f4e6b0;
@define-color warning_fg_color       #3a2e00;

@define-color error_color            #ba1a1a;
@define-color error_bg_color         #ffdad6;
@define-color error_fg_color         #93000a;

@define-color window_bg_color        #fdf8f5;
@define-color window_fg_color        #1c1b1a;

@define-color view_bg_color          #fdf8f5;
@define-color view_fg_color          #1c1b1a;

@define-color headerbar_bg_color     #f7f3f0;
@define-color headerbar_fg_color     #1c1b1a;
@define-color headerbar_border_color #ccc6bb;
@define-color headerbar_backdrop_color #fdf8f5;
@define-color headerbar_shade_color  rgba(0,0,0,.07);
@define-color headerbar_darker_shade_color rgba(0,0,0,.14);

@define-color card_bg_color          #f2edea;
@define-color card_fg_color          #1c1b1a;
@define-color card_shade_color       rgba(0,0,0,.07);

@define-color dialog_bg_color        #fdf8f5;
@define-color dialog_fg_color        #1c1b1a;

@define-color popover_bg_color       #fdf8f5;
@define-color popover_fg_color       #1c1b1a;
@define-color popover_shade_color    rgba(0,0,0,.07);

@define-color shade_color            rgba(0,0,0,.07);
@define-color scrollbar_outline_color rgba(0,0,0,.15);
@define-color borders                #ccc6bb;
@define-color unfocused_borders      #ddd9d6;
@define-color thumbnail_bg_color     #ece7e4;

/* ── Scrollbars ─────────────────────────────── */
scrollbar slider {
  background-color: #ccc6bb;
  border-radius: 4px;
  min-width: 6px;
  min-height: 6px;
}
scrollbar slider:hover {
  background-color: #7b776d;
}`,

  "Spicetify": `; ╔══════════════════════════════════════════╗
; ║  AtlasAta - Caelestia Light              ║
; ║  Spicetify color.ini                     ║
; ║  ~./config/spicetify/Themes/             ║
; ║      <ThemeName>/color.ini               ║
; ╚══════════════════════════════════════════╝

[AtlasAta - Caelestia Light]
text                 = 1c1b1a
subtext              = 4a473e
sidebar-text         = 1c1b1a
main                 = fdf8f5
sidebar              = f7f3f0
player               = f2edea
card                 = ece7e4
shadow               = 0f0f0e
selected-row         = e8e2d7
button               = 3b3628
button-active        = 524d3d
button-disabled      = ccc6bb
tab-active           = 3b3628
notification         = 3b3628
notification-error   = ba1a1a
misc                 = ccc6bb`,

  "VS Code": `// ╔══════════════════════════════════════════╗
// ║  AtlasAta - Caelestia Light              ║
// ║  VS Code / VSCodium                      ║
// ║  Paste into settings.json                ║
// ║  (Ctrl/Cmd + Shift + P →                 ║
// ║   "Open User Settings JSON")             ║
// ╚══════════════════════════════════════════╝

{
  "workbench.colorCustomizations": {
    "[AtlasAta - Caelestia Light]": {
      "editor.background":                    "#fdf8f5",
      "editor.foreground":                    "#1c1b1a",
      "editor.lineHighlightBackground":       "#f2edea",
      "editor.selectionBackground":           "#e8e2d770",
      "editor.inactiveSelectionBackground":   "#e8e2d740",
      "editor.findMatchBackground":           "#c5aa3d50",
      "editor.findMatchHighlightBackground":  "#a0871a30",
      "editorCursor.foreground":              "#625e56",
      "editorCursor.background":              "#fdf8f5",
      "editorLineNumber.foreground":          "#ada9a2",
      "editorLineNumber.activeForeground":    "#7b776d",
      "editorIndentGuide.background1":        "#e6e2df",
      "editorIndentGuide.activeBackground1":  "#ccc6bb",
      "editorWhitespace.foreground":          "#ccc6bb",
      "editorRuler.foreground":               "#e6e2df",
      "editorOverviewRuler.border":           "#ccc6bb",
      "sideBar.background":                   "#f7f3f0",
      "sideBar.foreground":                   "#1c1b1a",
      "sideBar.border":                       "#ccc6bb",
      "sideBarTitle.foreground":              "#4a473e",
      "sideBarSectionHeader.background":      "#f2edea",
      "sideBarSectionHeader.border":          "#e6e2df",
      "activityBar.background":               "#f2edea",
      "activityBar.foreground":               "#1c1b1a",
      "activityBar.inactiveForeground":       "#ada9a2",
      "activityBar.activeBorder":             "#3b3628",
      "activityBar.border":                   "#ccc6bb",
      "activityBarBadge.background":          "#3b3628",
      "activityBarBadge.foreground":          "#ffffff",
      "statusBar.background":                 "#3b3628",
      "statusBar.foreground":                 "#ffffff",
      "statusBar.border":                     "#575242",
      "statusBar.noFolderBackground":         "#575242",
      "statusBar.debuggingBackground":        "#9b782c",
      "statusBarItem.hoverBackground":        "#575242",
      "titleBar.activeBackground":            "#f2edea",
      "titleBar.activeForeground":            "#1c1b1a",
      "titleBar.inactiveBackground":          "#f7f3f0",
      "titleBar.inactiveForeground":          "#7b776d",
      "titleBar.border":                      "#ccc6bb",
      "tab.activeBackground":                 "#fdf8f5",
      "tab.activeForeground":                 "#1c1b1a",
      "tab.activeBorderTop":                  "#3b3628",
      "tab.inactiveBackground":               "#f2edea",
      "tab.inactiveForeground":               "#7b776d",
      "tab.border":                           "#ccc6bb",
      "tab.hoverBackground":                  "#ece7e4",
      "editorGroupHeader.tabsBackground":     "#f2edea",
      "editorGroupHeader.noTabsBackground":   "#f7f3f0",
      "panel.background":                     "#f7f3f0",
      "panel.border":                         "#ccc6bb",
      "panelTitle.activeForeground":          "#1c1b1a",
      "panelTitle.activeBorder":              "#3b3628",
      "panelTitle.inactiveForeground":        "#7b776d",
      "terminal.background":                  "#fdf8f5",
      "terminal.foreground":                  "#1c1b1a",
      "terminal.selectionBackground":         "#e8e2d770",
      "terminal.ansiBlack":                   "#9e9a95",
      "terminal.ansiRed":                     "#815900",
      "terminal.ansiGreen":                   "#8d8200",
      "terminal.ansiYellow":                  "#8d6a00",
      "terminal.ansiBlue":                    "#a0871a",
      "terminal.ansiMagenta":                 "#916000",
      "terminal.ansiCyan":                    "#7a8734",
      "terminal.ansiWhite":                   "#27211d",
      "terminal.ansiBrightBlack":             "#0f0f0e",
      "terminal.ansiBrightRed":               "#9f6f00",
      "terminal.ansiBrightGreen":             "#afa221",
      "terminal.ansiBrightYellow":            "#ae8516",
      "terminal.ansiBrightBlue":              "#c5aa3d",
      "terminal.ansiBrightMagenta":           "#b47800",
      "terminal.ansiBrightCyan":              "#9aa751",
      "terminal.ansiBrightWhite":             "#2e2723",
      "focusBorder":                          "#3b3628",
      "selection.background":                 "#e8e2d770",
      "button.background":                    "#3b3628",
      "button.foreground":                    "#ffffff",
      "button.hoverBackground":               "#575242",
      "button.secondaryBackground":           "#f2edea",
      "button.secondaryForeground":           "#1c1b1a",
      "input.background":                     "#f2edea",
      "input.border":                         "#ccc6bb",
      "input.foreground":                     "#1c1b1a",
      "inputOption.activeBorder":             "#3b3628",
      "inputOption.activeBackground":         "#e8e2d7",
      "dropdown.background":                  "#fdf8f5",
      "dropdown.border":                      "#ccc6bb",
      "dropdown.foreground":                  "#1c1b1a",
      "list.activeSelectionBackground":       "#e8e2d7",
      "list.activeSelectionForeground":       "#1c1b1a",
      "list.hoverBackground":                 "#f2edea",
      "list.focusBackground":                 "#e8e2d7",
      "list.inactiveSelectionBackground":     "#ece7e4",
      "badge.background":                     "#3b3628",
      "badge.foreground":                     "#ffffff",
      "progressBar.background":               "#3b3628",
      "scrollbar.shadow":                     "#00000010",
      "scrollbarSlider.background":           "#ccc6bb80",
      "scrollbarSlider.hoverBackground":      "#7b776d80",
      "scrollbarSlider.activeBackground":     "#7b776daa",
      "editorBracketHighlight.foreground1":   "#3b3628",
      "editorBracketHighlight.foreground2":   "#9b782c",
      "editorBracketHighlight.foreground3":   "#4b882e",
      "editorBracketHighlight.foreground4":   "#00664e",
      "editorBracketHighlight.foreground5":   "#636e1c",
      "editorBracketHighlight.foreground6":   "#625e56",
      "gitDecoration.addedResourceForeground":     "#4b882e",
      "gitDecoration.modifiedResourceForeground":  "#9b782c",
      "gitDecoration.deletedResourceForeground":   "#ba1a1a",
      "gitDecoration.untrackedResourceForeground": "#636e1c",
      "gitDecoration.ignoredResourceForeground":   "#ada9a2"
    }
  }
}`,

  "Waybar CSS": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  Waybar                                  ║
   ║  ~/.config/waybar/style.css              ║
   ╚══════════════════════════════════════════╝ */

* {
  --cl-bg:        #fdf8f5;
  --cl-bg-low:    #f7f3f0;
  --cl-surface:   #f2edea;
  --cl-surface-h: #ece7e4;
  --cl-fg:        #1c1b1a;
  --cl-sub:       #7b776d;
  --cl-border:    #ccc6bb;
  --cl-primary:   #3b3628;
  --cl-accent:    #9b782c;
  --cl-green:     #4b882e;
  --cl-red:       #ba1a1a;
  --cl-yellow:    #9a7a00;
  --cl-blue:      #00664e;

  font-family: "Inter", sans-serif;
  font-size: 13px;
  border: none;
  border-radius: 0;
  min-height: 0;
}

window#waybar {
  background-color: var(--cl-bg-low);
  border-bottom: 1px solid var(--cl-border);
  color: var(--cl-fg);
}

#workspaces button {
  padding: 0 6px;
  color: var(--cl-sub);
  background-color: transparent;
  border-bottom: 2px solid transparent;
}
#workspaces button:hover {
  background-color: var(--cl-surface);
  color: var(--cl-fg);
}
#workspaces button.active {
  color: var(--cl-fg);
  border-bottom: 2px solid var(--cl-primary);
}
#workspaces button.urgent {
  color: var(--cl-red);
  border-bottom: 2px solid var(--cl-red);
}

#clock, #battery, #cpu, #memory, #network,
#pulseaudio, #custom-launcher, #tray {
  padding: 0 10px;
  color: var(--cl-fg);
}

#battery.charging { color: var(--cl-green); }
#battery.warning:not(.charging) { color: var(--cl-yellow); }
#battery.critical:not(.charging) { color: var(--cl-red); }

#network.disconnected { color: var(--cl-red); }
#pulseaudio.muted { color: var(--cl-sub); }`,

  "Rofi": `/* ╔══════════════════════════════════════════╗
   ║  AtlasAta - Caelestia Light              ║
   ║  Rofi                                    ║
   ║  ~/.config/rofi/caelestia-light.rasi     ║
   ║  In config.rasi: @theme                  ║
   ║    "caelestia-light"                     ║
   ╚══════════════════════════════════════════╝ */

* {
  cl-bg:        #fdf8f5;
  cl-bg-low:    #f7f3f0;
  cl-surface:   #f2edea;
  cl-surface-h: #e8e2d7;
  cl-border:    #ccc6bb;
  cl-fg:        #1c1b1a;
  cl-sub:       #7b776d;
  cl-primary:   #3b3628;
  cl-accent:    #9b782c;
  cl-urgent:    #ba1a1a;

  background-color: transparent;
  text-color:       @cl-fg;
}

window {
  background-color: @cl-bg;
  border:           1px solid @cl-border;
  border-radius:    8px;
  padding:          8px;
}

mainbox       { padding: 0; }
inputbar      { padding: 8px 12px; background-color: @cl-surface; border-radius: 6px; }
prompt        { text-color: @cl-sub; }
entry         { text-color: @cl-fg; }
placeholder   { text-color: @cl-sub; }

listview      { padding: 4px 0 0; }

element {
  padding:          8px 12px;
  border-radius:    6px;
}
element normal.normal  { background-color: transparent; text-color: @cl-fg; }
element normal.urgent  { text-color: @cl-urgent; }
element selected.normal {
  background-color: @cl-surface-h;
  text-color:       @cl-fg;
}
element selected.urgent { background-color: @cl-urgent; text-color: #ffffff; }
element-icon  { size: 1.2em; }
element-text  { vertical-align: 0.5; }

scrollbar {
  handle-color:    @cl-border;
  handle-width:    4px;
}`,

  "Dunst": `# ╔══════════════════════════════════════════╗
# ║  AtlasAta - Caelestia Light              ║
# ║  Dunst notification daemon               ║
# ║  ~/.config/dunst/dunstrc                 ║
# ╚══════════════════════════════════════════╝

[global]
    font         = "Inter 11"
    corner_radius = 8
    frame_width  = 1
    frame_color  = "#ccc6bb"
    separator_color = "#e6e2df"
    background   = "#fdf8f5"
    foreground   = "#1c1b1a"
    highlight    = "#3b3628"

[urgency_low]
    background  = "#f7f3f0"
    foreground  = "#4a473e"
    frame_color = "#ddd9d6"
    timeout     = 5

[urgency_normal]
    background  = "#fdf8f5"
    foreground  = "#1c1b1a"
    frame_color = "#ccc6bb"
    timeout     = 10

[urgency_critical]
    background  = "#ffdad6"
    foreground  = "#93000a"
    frame_color = "#ba1a1a"
    timeout     = 0`,
};

const GROUPS = [
  { label: "Universal",      items: ["CSS Variables"] },
  { label: "Firefox",        items: ["userChrome.css", "userContent.css"] },
  { label: "Terminals",      items: ["Alacritty (TOML)", "Kitty", "foot", "WezTerm (Lua)", "Windows Terminal", "Konsole / Yakuake"] },
  { label: "Desktop (Linux)",items: ["Hyprland", "GTK CSS", "Waybar CSS", "Rofi", "Dunst"] },
  { label: "Apps",           items: ["Spicetify", "VS Code"] },
];

export default function CaelestiaLight() {
  const [active, setActive] = useState("CSS Variables");
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(CONFIGS[active]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ fontFamily: "'DM Mono', 'Fira Code', monospace", background: "var(--color-background-primary)", color: "var(--color-text-primary)", padding: "0 0 2rem" }}>

      {/* Header */}
      <div style={{ padding: "1.5rem 1.5rem 1rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <p style={{ margin: "0 0 .25rem", fontSize: 11, letterSpacing: ".12em", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
          color preset
        </p>
        <h2 style={{ margin: "0 0 .75rem", fontSize: 18, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>
          AtlasAta – Caelestia Light
        </h2>

        {/* Accent + surface swatches */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {SWATCHES.map(s => (
            <div key={s.label} title={`${s.label}: ${s.hex}`}
              style={{ width: 28, height: 28, borderRadius: 5, background: s.hex,
                       border: "0.5px solid var(--color-border-tertiary)", cursor: "default", flexShrink: 0 }}
            />
          ))}
        </div>

        {/* ANSI 0–15 swatches */}
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {ANSI_SWATCHES.map(s => (
            <div key={s.label} title={`${s.label}: ${s.hex}`}
              style={{ width: 22, height: 22, borderRadius: 3, background: s.hex,
                       border: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}
            />
          ))}
        </div>
        <p style={{ margin: ".5rem 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
          top row: palette accents · bottom row: 16 ANSI terminal colors (0–15)
        </p>
      </div>

      {/* Nav groups */}
      <div style={{ padding: "0 1.5rem" }}>
        {GROUPS.map(g => (
          <div key={g.label} style={{ marginTop: "1rem" }}>
            <p style={{ margin: "0 0 .4rem", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase",
                        color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
              {g.label}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.items.map(item => (
                <button key={item} onClick={() => setActive(item)}
                  style={{
                    padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                    fontFamily: "'DM Mono', monospace",
                    background: active === item ? "#3b3628" : "var(--color-background-secondary)",
                    color:      active === item ? "#ffffff" : "var(--color-text-primary)",
                    border:     active === item ? "0.5px solid #575242" : "0.5px solid var(--color-border-secondary)",
                    fontWeight: active === item ? 500 : 400,
                  }}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Code panel */}
      <div style={{ margin: "1.25rem 1.5rem 0", borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 14px", background: "var(--color-background-secondary)",
                      borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
            {active}
          </span>
          <button onClick={copy}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 12,
                     borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)",
                     background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                     fontFamily: "var(--font-sans)" }}>
            <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} style={{ fontSize: 13 }} aria-hidden="true" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre style={{
          margin: 0, padding: "1rem 1.25rem", overflowX: "auto", fontSize: 11.5,
          lineHeight: 1.6, background: "#fdf8f5", color: "#1c1b1a",
          maxHeight: 460, overflowY: "auto",
          fontFamily: "'DM Mono', 'Fira Code', 'Cascadia Code', monospace",
        }}>
          <code>{CONFIGS[active]}</code>
        </pre>
      </div>

      {/* Footer */}
      <p style={{ margin: "1rem 1.5rem 0", fontSize: 11, color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>
        <strong style={{ fontWeight: 500 }}>16 presets</strong> · CSS Variables · Firefox userChrome/userContent ·
        Alacritty · Kitty · foot · WezTerm · Windows Terminal · Konsole · Hyprland · GTK · Waybar · Rofi · Dunst ·
        Spicetify · VS Code
      </p>
    </div>
  );
}
