# Design reference

Source of truth: the user's extracted "C1 Final" boards in [Histoire UI Refresh-png/](<Histoire UI Refresh-png/>). Both light and dark PNGs are authoritative for this implementation. The original [design canvas](https://claude.ai/artifact/TbfJJdGmHk4tEA22f9Gvdi) supplies background context; its earlier "Exploration" page is reference only. Local boards can be inspected without access to that private canvas.

The canvas boards are mockups built from shared components (`FinRail`, `FinTree`, `FinInspector`, `FinTestsPanel`, `FinCommentsPanel`, `FinAgentPanel`, `FinToolbarPopover`, `FinContextMenu`, `FinCommentCard`). Treat their structure as layout intent, not as markup to copy. Sample data (Acme UI, counts, agent commands) is placeholder. Read a full board together with its matching component PNG; do not infer a new layout from an isolated component.

## Layout

| Region | Size | Notes |
| --- | --- | --- |
| Rail | 56px wide, full height | Logo, pane buttons, then bottom: theme toggle, panel collapse, settings |
| Side panel | 280px wide | Tree, search, tests, comments, or MCP; collapsible from the rail |
| Canvas | Remaining width | Floating toolbar centered at top (36px high), status line bottom-left |
| Inspector | 344 × (viewport − 24)px | Floating card, 12px from top/right/bottom, radius 16, shadow; closable, not draggable |
| Popovers | 240–300px | Anchored 6px below their toolbar button |

Canvas frames: label row (name + test status icon) above a white frame. Grid arrangement uses 3 columns of 208px frames with 24px gaps at default zoom; list arrangement uses one row per variant.

## Tokens

| Token | Light | Dark |
| --- | --- | --- |
| Canvas background | `#F1F1F3` | `#0D0E11` |
| Static home background | `#F7F7F8` | `#0D0E11` |
| Surface (panels, cards) | `#FFFFFF` | `#16171B` |
| Border | `#E4E4E7` | `#26282D` |
| Chip / segmented track | `#F4F4F5` | `#202227` |
| Input field | `#FAFAFA` | `#0F1013` |
| Text | `#18181B` | `#E6E7EA` |
| Body text | `#3F3F46` | `#B4B8C0` |
| Muted text | `#5F6370` | `#8A8E97` |
| Accent (primary) | `#059669` | `#34D399` |
| Accent soft background | `#ECFDF5` | `#34D3991F` |
| Accent text on soft | `#065F46` / links `#047857` | `#F3F4F6` / links `#34D399` |
| Danger | `#DC2626` text `#B91C1C` | `#F87171` |
| Danger background | `#FEF2F2` | `#2A1D1F` |
| Warning | `#B45309` | `#FBBF24` |
| Agent/AI violet | `#7C3AED` (text `#6D28D9`, bg `#F5F3FF`) | `#7C3AED` (text `#C4B5FD`, bg `#221B36`) |
| Measure overlay | `#E11D48` | `#E11D48` |
| Code block background | `#18181B` | `#18181B` |

Accent maps to `theme.colors.primary` (500 light, 400 dark); grays map to `theme.colors.gray`. Violet and measure red are fixed semantic colors, not theme colors.

Typography: Manrope 400–800 for UI, JetBrains Mono 400–500 for code, prop names, sizes, and shortcuts. Base 13px; panel titles 14–15px/800; page titles 24–36px/800 with −0.02em tracking.

Radii: 6–7px controls, 8–10px buttons and chips, 12–16px cards and floating panels. Shadows only on floating elements (toolbar, inspector, popovers, cards).

## Icons (Carbon)

| Use | Carbon icon |
| --- | --- |
| Home, Stories, Search, Tests, Comments, MCP, Settings | `home`, `catalog`, `search`, `chemistry`, `chat`, `bot`, `settings` |
| Theme toggle | `asleep` / `light` |
| Panel collapse/expand | `side-panel-close` / `side-panel-open` |
| Tree | `folder` (open and closed; chevron shows state), `cube` (story), `document` (docs), `dot-mark` (variant), `chevron-right`/`chevron-down` |
| Toolbar | `cursor-1` (select), `move` (pan — Carbon has no hand icon), `grid`, `list-boxes`, `data-table` (matrix), `laptop`/`mobile`/`tablet`/`screen`, `rotate`, `zoom-out`/`zoom-in`, `color-palette`, `ruler`, `camera`, `chat` |
| Inspector | `launch`, `close`, `copy`, `reset`, `bookmark`, `code`, `chevron-up`/`chevron-down` |
| Status | `checkmark-filled`, `error-filled`, `warning-alt-filled`, `in-progress`, `subtract` (skipped) |
| Menu and AI | `tree-view`, `link`, `compare`, `bookmark-add`, `add-comment`, `magic-wand`, `send-filled`, `attachment`, `user-avatar-filled`, `plug`, `terminal`, `edit`, `trash-can`, `filter`, `view`, `time`, `play-filled-alt`, `stop-filled-alt`, `renew`, `information`, `arrows-horizontal` |

Inspector tabs are text-only (no icons). The grab cursor shown while panning is the OS `grabbing` cursor, not an icon.

## Board to slice map

| Board | Extracted PNGs | Slice |
| --- | --- | --- |
| Story — Props | [Light](<Histoire UI Refresh-png/Story — Props.png>), [dark](<Histoire UI Refresh-png/Story — Props (dark).png>) | 02, 04, 05, 06 |
| Story — Props matrix | [Light](<Histoire UI Refresh-png/Story — Props matrix.png>), [dark](<Histoire UI Refresh-png/Story — Props matrix (dark).png>) | 07 |
| Story — Docs | [Light](<Histoire UI Refresh-png/Story — Docs.png>), [dark](<Histoire UI Refresh-png/Story — Docs (dark).png>) | 06 |
| Story — Events | [Light](<Histoire UI Refresh-png/Story — Events.png>), [dark](<Histoire UI Refresh-png/Story — Events (dark).png>) | 06 |
| Story — Source | [Light](<Histoire UI Refresh-png/Story — Source.png>), [dark](<Histoire UI Refresh-png/Story — Source (dark).png>) | 06 |
| Markdown page | [Light](<Histoire UI Refresh-png/Markdown page.png>), [dark](<Histoire UI Refresh-png/Markdown page (dark).png>) | 11 |
| Tests pane | [Light](<Histoire UI Refresh-png/Tests pane.png>), [dark](<Histoire UI Refresh-png/Tests pane (dark).png>) | 09 |
| Search | [Light](<Histoire UI Refresh-png/Search.png>), [dark](<Histoire UI Refresh-png/Search (dark).png>) | 08 |
| MCP pane | [Light](<Histoire UI Refresh-png/MCP pane.png>), [dark](<Histoire UI Refresh-png/MCP pane (dark).png>) | 15 |
| Home | [Light](<Histoire UI Refresh-png/Home.png>), [dark](<Histoire UI Refresh-png/Home (dark).png>) | 10 |
| Home — static build | [Light](<Histoire UI Refresh-png/Home — static build.png>), [dark](<Histoire UI Refresh-png/Home — static build (dark).png>) | 10 |
| Settings | [Light](<Histoire UI Refresh-png/Settings.png>), [dark](<Histoire UI Refresh-png/Settings (dark).png>) | 12 |
| Settings — AI agents (ACP) | [Light](<Histoire UI Refresh-png/Settings — AI agents (ACP).png>), [dark](<Histoire UI Refresh-png/Settings — AI agents (ACP) (dark).png>) | 16 |
| Right-click menu | [Light](<Histoire UI Refresh-png/Right-click menu.png>), [dark](<Histoire UI Refresh-png/Right-click menu (dark).png>) | 13 |
| Comment for AI — compose | [Light](<Histoire UI Refresh-png/Comment for AI — compose.png>), [dark](<Histoire UI Refresh-png/Comment for AI — compose (dark).png>) | 17 |
| Comment for AI — agent reply | [Light](<Histoire UI Refresh-png/Comment for AI — agent reply.png>), [dark](<Histoire UI Refresh-png/Comment for AI — agent reply (dark).png>) | 17 |
| Comments pane | [Light](<Histoire UI Refresh-png/Comments pane.png>), [dark](<Histoire UI Refresh-png/Comments pane (dark).png>) | 17 |
| Toolbar — Pan | [Light](<Histoire UI Refresh-png/Toolbar — Pan (Space middle mouse hand).png>), [dark](<Histoire UI Refresh-png/Toolbar — Pan (Space middle mouse hand) (dark).png>) | 04 |
| Toolbar — List arrange | [Light](<Histoire UI Refresh-png/Toolbar — List arrange.png>), [dark](<Histoire UI Refresh-png/Toolbar — List arrange (dark).png>) | 05 |
| Toolbar — Viewport menu | [Light](<Histoire UI Refresh-png/Toolbar — Viewport menu.png>), [dark](<Histoire UI Refresh-png/Toolbar — Viewport menu (dark).png>) | 05 |
| Toolbar — Rotated viewport | [Light](<Histoire UI Refresh-png/Toolbar — Rotated viewport.png>), [dark](<Histoire UI Refresh-png/Toolbar — Rotated viewport (dark).png>) | 05 |
| Toolbar — Zoom menu | [Light](<Histoire UI Refresh-png/Toolbar — Zoom menu.png>), [dark](<Histoire UI Refresh-png/Toolbar — Zoom menu (dark).png>) | 05 |
| Toolbar — Background picker | [Light](<Histoire UI Refresh-png/Toolbar — Background picker.png>), [dark](<Histoire UI Refresh-png/Toolbar — Background picker (dark).png>) | 05 |
| Toolbar — Measure | [Light](<Histoire UI Refresh-png/Toolbar — Measure.png>), [dark](<Histoire UI Refresh-png/Toolbar — Measure (dark).png>) | 05 |
| Toolbar — Screenshot | [Light](<Histoire UI Refresh-png/Toolbar — Screenshot.png>), [dark](<Histoire UI Refresh-png/Toolbar — Screenshot (dark).png>) | 14 |

Shared component details: [Rail](<Histoire UI Refresh-png/Component · Rail.png>) (02), [Story tree](<Histoire UI Refresh-png/Component · Story tree.png>) (03), [Inspector](<Histoire UI Refresh-png/Component · Inspector.png>) (06), [Tests pane](<Histoire UI Refresh-png/Component · Tests pane.png>) (09), [MCP pane](<Histoire UI Refresh-png/Component · MCP pane.png>) (15), [Toolbar popovers](<Histoire UI Refresh-png/Component · Toolbar popovers.png>) (05), [Context menu](<Histoire UI Refresh-png/Component · Context menu.png>) (13), [Comment card](<Histoire UI Refresh-png/Component · Comment card.png>), and [Comments pane](<Histoire UI Refresh-png/Component · Comments pane.png>) (17).
