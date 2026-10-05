---
name: Histoire Workbench
description: Spatial workbench for component stories and variants.
colors:
  canvas: "rgb(241 241 243)"
  home: "rgb(247 247 248)"
  surface: "rgb(255 255 255)"
  border: "rgb(228 228 231)"
  chip: "rgb(244 244 245)"
  input: "rgb(250 250 250)"
  text: "rgb(24 24 27)"
  body: "rgb(63 63 70)"
  muted: "rgb(95 99 112)"
  accent: "rgb(5 150 105)"
  accent-soft: "rgb(236 253 245)"
  accent-text: "rgb(6 95 70)"
  accent-link: "rgb(4 120 87)"
  danger: "rgb(220 38 38)"
  danger-text: "rgb(185 28 28)"
  danger-soft: "rgb(254 242 242)"
  warn: "rgb(180 83 9)"
  agent: "rgb(124 58 237)"
  agent-text: "rgb(109 40 217)"
  agent-soft: "rgb(245 243 255)"
  measure: "rgb(225 29 72)"
  code: "rgb(24 24 27)"
  canvas-dark: "rgb(13 14 17)"
  home-dark: "rgb(13 14 17)"
  surface-dark: "rgb(22 23 27)"
  border-dark: "rgb(38 40 45)"
  chip-dark: "rgb(32 34 39)"
  input-dark: "rgb(15 16 19)"
  text-dark: "rgb(230 231 234)"
  body-dark: "rgb(180 184 192)"
  muted-dark: "rgb(138 142 151)"
  accent-dark: "rgb(52 211 153)"
  accent-soft-dark: "rgb(52 211 153 / 0.12)"
  accent-text-dark: "rgb(243 244 246)"
  accent-link-dark: "rgb(52 211 153)"
  danger-dark: "rgb(248 113 113)"
  danger-text-dark: "rgb(248 113 113)"
  danger-soft-dark: "rgb(42 29 31)"
  warn-dark: "rgb(251 191 36)"
  agent-text-dark: "rgb(196 181 253)"
  agent-soft-dark: "rgb(34 27 54)"
typography:
  display:
    fontFamily: '"Manrope", system-ui, sans-serif'
    fontSize: "clamp(28px, 4vw, 36px)"
    fontWeight: 800
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Manrope", system-ui, sans-serif'
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Manrope", system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 800
  body:
    fontFamily: '"Manrope", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: '"Manrope", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 700
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: "13px"
    fontWeight: 400
  metadata:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: "11px"
    fontWeight: 400
  code:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  control: "7px"
  button: "9px"
  panel: "16px"
components:
  home-action-primary:
    backgroundColor: "{colors.accent-link}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "10px"
    padding: "12px 16px"
  home-action-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "10px"
    padding: "12px 16px"
  rail-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "10px"
    padding: "0"
    size: "40px"
  rail-button-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "10px"
    padding: "0"
    size: "40px"
  toolbar-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 5px"
    height: "28px"
  search-field:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  story-row-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    typography: "{typography.label}"
    rounded: "8px"
    padding: "6px 8px"
  inspector-tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "32px"
  prop-input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
  browse-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "12px"
    padding: "18px"
  mcp-status-enabled:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-link}"
    rounded: "999px"
    padding: "4px 8px"
---

# Design System: Histoire Workbench

## Overview

**Creative North Star: "C1 Spatial Workbench"**

C1 organizes component work as a quiet spatial workbench: a slim rail, one swappable pane, an open canvas, and a floating inspector. Flat neutral grounds keep component previews central. Sparse green marks selection, live state, focus, and successful tests.

Manrope carries interface labels and titles; JetBrains Mono distinguishes source, prop names, dimensions, counts, and shortcuts. Light and dark share hierarchy and geometry. Compact controls support repeated inspection without adding explanatory copy.

**Key Characteristics:**

- Flat neutral grounds with sparse semantic color.
- Compact interface type and explicit technical metadata.
- Rounded floating tools around independent preview content.
- Equivalent light and dark structure with reachable narrow-layout controls.

Approved visual authority: [C1 Final boards](<plans/ui-redesign/Histoire UI Refresh-png/>), including both light and dark variants. Recorded implementation: [root tokens](packages/histoire-app/src/app/style/tokens.pcss), [font loading](packages/histoire-app/src/app/style/fonts.pcss), [standalone theme aliases](packages/histoire-app/src/app/App.vue), [shell](packages/histoire-app/src/app/components/shell/), and current canvas, inspector, panes, and Home components. Frontmatter records resolved default RGB values; source custom properties remain implementation authority. Project overrides flow through `theme.colors` and `theme.fonts`.

## Colors

Cool pale grounds in light mode and near-black grounds in dark mode distinguish workspace from surfaces without competing with previews.

### Primary

- **Workbench Green** (`accent`, `accent-dark`): active rail destinations, selected frame outlines, focus, status dots, and successful tests.
- **Green Tint** (`accent-soft`, `accent-soft-dark`): selected tree rows and subtle active backgrounds. Dark tint preserves authored alpha.
- **Green State Text** (`accent-text`, `accent-text-dark`): readable text on tinted states.
- **Green Link** (`accent-link`, `accent-link-dark`): links, compact success text, and filled Home actions.

### Neutral

- **Canvas Ground** (`canvas`, `canvas-dark`): open story workspace.
- **Home Ground** (`home`, `home-dark`): catalog overview background.
- **Surface** (`surface`, `surface-dark`): rail, pane, cards, and floating inspector.
- **Edge** (`border`, `border-dark`): low-contrast separators and outlines.
- **Control Track** (`chip`, `chip-dark`): hover areas and segmented tracks.
- **Input Ground** (`input`, `input-dark`): editable fields.
- **Primary Ink**, **Body Ink**, **Muted Ink** (`text`, `body`, `muted` and dark counterparts): title, reading, and secondary metadata hierarchy.
- **Code Ground** (`code`): source drawer in both themes.

### Status and tools

- **Failure Red** (`danger`, `danger-text`, `danger-soft` and dark counterparts): failed tests, unavailable operations, and error surfaces.
- **Warning Amber** (`warn`, `warn-dark`): collection or stale-state warnings.
- **Agent Violet** (`agent`, `agent-text`, `agent-soft` and dark text/tint counterparts): inspector event counts, agent/MCP activity, and comments sent to agents.
- **Measure Rose** (`measure`): measurement overlay independent of selected accent.

**The Semantic Accent Rule.** Use green for actionable or selected workbench state. Keep violet specific to event counts and agent/comment activity, red specific to failure or measurement, and neutral surfaces dominant.

**The Preview Boundary Rule.** Scope workbench tokens and fonts to the owning provider. Component previews keep their own visual system.

## Typography

**Interface Font:** Manrope, with system-ui and sans-serif fallbacks. Bundled variable font covers weights (400–800).

**Technical Font:** JetBrains Mono, with ui-monospace and monospace fallbacks. Bundled font covers weights (400–500).

Rounded interface letterforms keep dense labels calm; monospace marks values users inspect or copy. Type roles are task-based rather than one mathematical scale.

### Hierarchy

- **Display:** Home project title; fluid size and tight tracking from frontmatter.
- **Headline:** story canvas title; compact bold heading with explicit line height.
- **Title:** panel and inspector headings. Settings uses a local page heading variant rather than changing global title tokens.
- **Body:** workbench text and editable controls.
- **Label:** inspector tabs and emphasized action labels.
- **Mono:** prop names and types at ordinary readable control size.
- **Metadata:** counts, build details, dimensions, breadcrumbs, and shortcuts. Individual compact annotations also use local smaller variants.
- **Code:** source drawer, with generous line spacing and horizontal scrolling.

**The Readable Controls Rule.** Keep ordinary inspector fields, prop names, types, and tabs at the body or label size. Smaller metadata styles belong to counts, breadcrumbs, shortcuts, and source.

## Layout

Desktop shell uses full-height rail (56px), optional pane (280px default), and remaining workspace. Inspector floats inside workspace (344px default), inset (12px), capped to available width. Pane and inspector widths resize through edge separators, persist locally and reserve usable canvas space. Inspector closes without changing canvas ownership and is not draggable. Toolbar and pan hint stay centered within canvas space excluding the visible inspector; toolbar keeps compact height (36px). These resize affordances follow the user's 2026-10-04 refinement of the supplied boards.

At provider container width (640px or below), rail becomes a bottom strip (56px). Every action shares available width. Pane becomes an overlay above rail; inspector moves below toolbar. Toolbar measures available canvas width and moves complete rightmost groups into a dropdown with labeled action rows, preserving every tool. These changes follow provider size rather than assuming full browser width.

Frames use viewport dimensions and zoom. Default grid has three columns; screen-space gaps remain (24px). List adds a fixed readable label area. Home uses a bounded content area (1600px), catalog cards, and secondary content; columns stack below its page breakpoint. Settings narrows its navigation before wrapping section controls into a horizontal layout.

Spacing follows repeated compact steps (3px, 6px, 8px, 12px, 16px, 18px, 24px). These are observed component measures, not a declared global spacing-token scale. Allow panes and inspector content to scroll independently; truncate catalog labels while preserving accessible names.

## Elevation & Depth

Neutral tone and quiet borders separate resting surfaces. Soft shadows establish floating inspector, popovers, and toolbar. Tiny segmented-control and toggle shadows communicate interaction state. No ambient shadow belongs on rail or desktop pane.

### Shadow Vocabulary

Source tokens provide `shadow-toolbar`, `shadow-popover`, and `shadow-panel`, each with light/dark variants. Inspector and narrow pane use panel shadow. Toolbar strip and toolbar popover currently use local soft-shadow values; sidecar records those real variants without promoting them to global tokens.

**The Flat Ground Rule.** Keep page grounds, rail, and side panes flat. Use soft shadows for floating chrome and small selected-control or toggle cues.

## Shapes

Controls use compact rounded corners; buttons are slightly softer and floating panels rounder. Canonical source radii live in frontmatter. Implemented tree rows, toolbar containers, Browse cards, and status pills carry their own observed radii. Keep these component silhouettes instead of replacing all corners with one radius.

Use thin quiet borders for fields, frame edges, and page cards. Selected frames receive a green outline. Status dots and switch knobs remain circular. Comment pins retain their asymmetric pin silhouette.

## Components

### Buttons

Home has filled green and bordered surface actions. Rail buttons are icon-only square destinations with neutral hover and green active tint. Toolbar buttons are small neutral tools with pressed backgrounds. All keep native button semantics, accessible names, and visible keyboard focus. Disabled controls retain their geometry and reduce opacity.

### Inputs / Fields

Search combines an inset field, Carbon search icon, and optional monospace shortcut. Inspector fields use input ground, thin border, readable body type, and compact corners. Prop names and types use mono. Focus uses green outline or a green field boundary; placeholder text uses muted ink.

### Navigation

Rail selects one pane. Story tree uses indentation, Carbon folder/story/document/variant glyphs, quiet hover, bold current story, and green selected variant. Roving keyboard focus follows visible rows. Inspector tabs use text labels; event counts and test state may accompany those labels. Selected tab becomes a surface within a neutral track.

### Chips

MCP status is a compact pill with a status dot and text. Enabled state uses green tint and link text; unavailable or disabled state uses neutral track and muted ink. Keep status words alongside color.

### Cards / Containers

Browse cards use flat surface, quiet border, compact padding, and a tinted icon tile. Hover and keyboard focus strengthen their actionable edge. Inspector is a floating rounded card with independently scrolling content and anchored Source drawer. Toolbar popovers are bounded floating surfaces with rounded menu rows and provider-aware placement.

### Motion and focus

Motion serves direct state feedback: short toggle transforms, controlled canvas navigation, and bounded popover appearance. Source defines workbench easing and reduced-motion overrides. Toolbar overflow follows measured container space; controls retain their mounted state when moving between toolbar and dropdown. Base keyboard outline is (2px), with component-specific offsets for compact rows and controls.

### Density

Comfortable preserves supplied board spacing. Compact is a local workbench override: tighter Settings rows, tree/search/comment/MCP rows, and native inspector controls. Typography and preview dimensions remain unchanged.

Fixed tree rows use 32px/28px recycler offsets; test rows use 40px/36px. Each rendered row remains one pixel shorter than its offset. Dynamic rows keep measured heights. CSS density variables reset at every provider so nested embeds retain their own defaults.

## Do's and Don'ts

### Do:

- **Do** use semantic workbench variables so theme changes reach native SDK surfaces.
- **Do** use bundled Carbon SVGs and text labels for inspector tabs.
- **Do** preserve provider-relative rail, pane, toolbar, and inspector bounds.
- **Do** keep every narrow-layout rail action and canvas tool reachable.
- **Do** use real catalog labels and counts; unnamed Home groups receive Stories or Guides labels.

### Don't:

- **Don't** apply workbench fonts or palette to story preview documents.
- **Don't** use green or violet as decoration unrelated to state or action.
- **Don't** add explanatory filler or replace real project content with board sample data.
- **Don't** turn local legacy styling differences into new global tokens.
