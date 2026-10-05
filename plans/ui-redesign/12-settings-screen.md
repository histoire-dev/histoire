# 12 — Settings screen

## Outcome and prerequisites

Depends on: 02, 05.

A settings page at `/settings/:section?` with a section list: General, Appearance, Viewports, Tests (dev), AI agents (dev, content in 16), MCP server (dev), Keyboard shortcuts, About. Appearance covers color scheme (System/Light/Dark), density, viewport presets (add/edit/remove), and story backgrounds. Settings saved locally override project config defaults; a reset returns to config values.

## Owned files

- Add route `settings` in `app/router.ts` (additive; existing routes unchanged).
- Add `app/components/pages/settings/{SettingsPage,SettingsNav,AppearanceSection,ViewportsSection,BackgroundsSection,TestsSection,McpSection,ShortcutsSection,AboutSection,GeneralSection}.vue`.
- Add `app/stores/settings.ts` (`_histoire-ui-settings`) and `app/stores/presets-config.ts` (user overrides for `responsivePresets`/`backgroundPresets`, merged with config).
- Read MCP status from slice 15's snapshot when present (endpoint, enabled, copy client config); show "disabled" otherwise.
- About shows `$histoire-build-info` (slice 10) and package versions.

## Tests first

1. Color scheme writes the existing `histoire-color-scheme` behavior; `hideColorSchemeSwitch` hides the control.
2. Viewport preset edits merge over config presets; removing a config preset hides it locally; reset restores config.
3. Background presets the same; picker (05) reads the merged list.
4. Static builds hide Tests, AI agents, and MCP sections; deep links to them redirect to Appearance.
5. Shortcuts section lists the registry from slice 13 with conflicts flagged (read-only until 13 lands).
6. Unknown section param redirects to `appearance`.

## Implementation steps

1. Section components are lazy; nav highlights from route param.
2. Keep config as the source of defaults; user settings are stored locally as overrides. Writing them into the project config file is slice 19.
3. "Saved to localStorage · defaults from histoire.config" footer text from the design.

## Failure paths

Corrupt stored settings are discarded with a console warning and defaults restored.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches Settings boards in both themes; overrides apply immediately to the toolbar and canvas.

## Non-goals

Syncing settings across machines, writing project config files (slice 19).

## Handoff

Settings store API and section registration for slice 16 (AI agents section).
