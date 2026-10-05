# Histoire UI redesign slice plans

Status: all 19 slices and extension 20 implemented and integrated. Typechecking, requested test/list/UI refinements and all 27 historical [implementation review](implementation-review.md) findings were repaired. **All 27 subsequent round 2 findings are also repaired within their reviewed scope**, with eleven Terra xhigh implementation owners, independent follow-up review and fresh dev/static validation. See [review round 2](implementation-review-round-2.md), [closure ledger](implementation-repair-round-2.md) and [executed checks](implementation-validation.md#2026-10-04-round-2-repair-campaign). Live ACP authentication and permission acceptance remain unverified. Plans were created 2026-10-02 against main, commit 92ed1047eee696e4d0f309dc4fae872d145a422c; implementation began 2026-10-03. Earlier executed checks remain in [implementation validation](implementation-validation.md); planned acceptance gates remain in [validation](validation.md).

## Intended outcome

Histoire's UI becomes the "C1" spatial workbench explored in the design canvas: a slim app rail, one swappable side panel, a pannable canvas of variant frames, a floating inspector, and Carbon iconography in light and dark themes. The same shell serves the dev server and static builds; dev-only surfaces (tests, comments, MCP activity, agents) disappear from static builds.

New capabilities ship with the redesign:

- Canvas navigation: pan with Space+drag, middle mouse, or the hand tool; zoom menu; rotate; measure overlay; per-frame backgrounds; screenshots.
- Props matrix: render every combination of two prop axes, with editable base props.
- Tests pane, search pane, comments pane, MCP activity pane, and a settings screen.
- Right-click menu on frames.
- Comments for AI: pin a comment to a variant/element and send it with context to a coding agent over the Agent Client Protocol (ACP).
- Production (static-hosting) home page and a dev home that extends it.

Existing story syntax, framework plugins, routes, query parameters, preview protocol, localStorage keys (or one-time migrations), CLI defaults, and `data-test-id` selectors remain compatible.

## Read first

1. [Design reference](design-reference.md): supplied PNG authority, tokens, icon mapping, board-to-slice map.
2. [Architecture and repository seams](architecture.md).
3. [Contracts](contracts.md): routes, settings, config, protocol additions, dev channel, comments and ACP data.
4. [Validation and acceptance matrix](validation.md).
5. Slice documents in dependency order. Supporting documents own shared contracts; slices must not redefine them.

## Slices and dependencies

| Slice | Outcome | Depends on |
| --- | --- | --- |
| [01](01-design-tokens-fonts-and-icons.md) | Root-scoped tokens, fonts, offline Carbon icons, theme config | None |
| [02](02-app-shell-rail-and-panel-host.md) | Rail, swappable side panel, floating inspector frame, dev/static filtering | 01 |
| [03](03-story-tree-panel.md) | Story tree with variants, folders, status; Search owns filtering | 02 |
| [04](04-canvas-viewport-and-frames.md) | Pan/zoom canvas, frame layout (grid/list), selection, stale/error states | 02 |
| [05](05-canvas-toolbar-and-tools.md) | Toolbar: tool switch, arrange, viewport, rotate, zoom, background, measure | 04 |
| [06](06-floating-inspector.md) | Props/Docs/Events/Tests tabs and Source drawer | 02, 04 |
| [07](07-props-matrix.md) | Two-axis props matrix with editable base props | 04, 06 |
| [08](08-search-pane.md) | Search as a rail pane, scopes, canvas match highlighting | 02, 04 |
| [09](09-tests-pane.md) | Project-wide test explorer, filters, run all, watch | 02, 06 |
| [10](10-home-dev-and-static.md) | Static home, dev home, build metadata | 02 |
| [11](11-markdown-pages.md) | Markdown story pages with outline | 02, 03 |
| [12](12-settings-screen.md) | Settings: appearance, viewports, backgrounds, shortcuts, tests, MCP, agents | 02, 05 |
| [13](13-context-menu-and-shortcuts.md) | Frame right-click menu and shortcut registry | 04, 05 |
| [14](14-screenshots-in-ui.md) | Dev UI channel; screenshot capture through the shared execution lane | 05 |
| [15](15-mcp-activity-pane.md) | MCP clients/operations over the UI channel, pane, follow mode | 02, 04, 14 |
| [16](16-acp-agents.md) | ACP agent client, agent settings, permission prompts | 12, 15 |
| [17](17-comments-for-ai.md) | Comment pins, composer, threads, comments pane, send to agent | 13, 16 |
| [18](18-config-codemod.md) | Formatting-preserving read/edit of the TS/JS config (codemod) | None |
| [19](19-settings-save-to-project.md) | "Save to project" from Settings into the TS/JS config | 12, 18 |
| [20](20-matrix-auto-detection.md) | Automatic finite prop discovery from existing runtime previews | 04, 07 |

Slices 03, 04, 08, and 10 can proceed in parallel after 02. Slice 18 is independent of the UI work and can land first. Slice 11 only needs the tree. Slice 14 needs the toolbar but not the inspector. The dependency map describes ownership; it does not authorize launching concurrent agents.

Slice 20 is the 2026-10-04 extension, planned and implemented by separate subagents. That day's user refinements also replace the Stories filter with Search, virtualize pane and inspector lists with a fixed 1px item gap, batch project test execution, resize both panels, move preset management into a menu, and lock measurements on click. These refinements supersede conflicting details in the original 19 slice plans.

## Milestones

- Foundation: 01–02 establish tokens, icons, the shell, and dev/static gating behind the existing views.
- Story workspace: 03–07 replace the story view with tree, canvas, toolbar, inspector, and matrix. Old split-pane story view is removed at the end of 06.
- Panes and pages: 08–12 add search, tests, home, Markdown pages, and settings.
- Interactions and AI: 13–17 add the context menu, screenshots, MCP activity, ACP agents, and comments.
- Project config: 18–19 add a config codemod and saving settings into the existing TS/JS config.

## Confirmed defaults

- Visual direction follows the user's extracted "C1 Final" PNGs in `Histoire UI Refresh-png/`; the Exploration page is reference only.
- Carbon is the only icon set. Icons are bundled offline; no runtime Iconify API fetch.
- Light and dark themes ship together; `theme.colors` overrides keep working.
- Static builds hide tests, comments, MCP, agents, and dev commands. They keep tree, canvas, inspector (props/docs/events/source), search, matrix, settings (appearance, viewports, backgrounds, shortcuts), and home.
- The inspector floats over the canvas, is not draggable, and can be closed but not pinned.
- Canvas frames are sized only by viewport presets; no manual frame resizing.
- Any canvas view pans with Space+drag, middle mouse, or the hand tool. Markdown pages scroll normally and have no canvas tools.
- "Save as variant" copies a snippet; agents edit story files through ACP under user permission. Explicit "Save to project" updates Histoire's TS/JS config through a codemod that refuses computed values. Local comments and screenshots write their configured/generated files under the project.
- Config format is unchanged: TS/JS configs with functions stay the only format.

## Resolved implementation assumptions

These defaults were selected while implementing the authorized slices; they are implementation assumptions, not separately confirmed user choices. The supplied PNGs remain visual authority.

1. Comments default to `.histoire/comments.json`, with lazy local storage, a configurable project-relative path, and no static-build I/O.
2. ACP uses editable Claude Code (`claude-agent-acp`), Gemini CLI (`gemini --acp`), and Codex (`codex-acp`) presets when no project presets are supplied. Agents are disabled by default; commands are never downloaded automatically and launch only for an explicit prompt.
3. Canvas defaults to a 24-frame live budget. Selected previews take priority; other frames receive placeholders outside the visible area/budget. Matrix reserves a slot for its canonical preview.
4. Manrope 400–800 and JetBrains Mono 400–500 are self-hosted with Latin/Latin Extended assets and licenses. Font-family overrides remain available through `theme.fonts`.

## Implementation and user documentation

The standalone shell now wraps its session in `@histoire/vue`'s `HistoireProvider`. Workbench stores are factories provided per provider; they consume SDK snapshots and reuse existing preview, controls, tests, search, and Node services. Standalone adapters own router, local storage, and dev-channel wiring. See [current architecture](architecture.md) for ownership and teardown.

User-facing behavior is documented in [shell/navigation](../../docs/guide/ui-shell.md), [stories/search/tests/home](../../docs/guide/ui-navigation.md), [inspector](../../docs/guide/ui-inspector.md), [matrix](../../docs/guide/ui-matrix.md), [settings](../../docs/guide/ui-settings.md), [screenshots/MCP](../../docs/guide/ui-screenshots-mcp.md), [ACP agents](../../docs/guide/ui-agents.md), and [comments](../../docs/guide/ui-comments.md). Project editing is documented in the [config codemod reference](../../docs/reference/config-codemod.md).

Implementation status alone does not establish browser or cross-framework acceptance. [Implementation validation](implementation-validation.md) records executed checks and known limits; [validation](validation.md) defines the acceptance matrix.

## Global implementation rules

- Preserve unrelated dirty, staged, untracked, and concurrent changes, including `plans/mcp-server` and `plans/embeddable-sdk` work.
- Authored source/test modules stay below 300 lines. Documentation exempt. Split by responsibility.
- Add JSDoc to functions, classes, types, and properties; comment non-obvious layout math, pointer handling, and synchronization.
- Write valuable behavior tests first. No CSS/class assertions, no implementation-mirroring tests, no duplicated fixtures or stubs.
- Use per-provider store factories and injection rather than prop drilling or module-level workbench singletons. The SDK session owns canonical selection, settings, and runtime state; standalone adapters own router/storage/dev integration (see [architecture](architecture.md)).
- Reuse existing preview protocol, preview iframe host, controls package, Markdown renderer, search index, tests store, and MCP runtime services. Do not create parallel engines.
- Keep existing `data-test-id`s working or update Cypress specs in the same slice.
- Each slice documents the config options and user-visible features it adds in `docs/` (VitePress) in the same slice.
- No commit, push, publish, or deploy without separate instruction.

## Non-goals

Mobile-first redesign beyond a usable narrow-width fallback, multi-user collaboration, cloud comment sync, visual regression service, editing story files from the UI, React/Web Component shells, and replacing the preview runtime or story engine.
