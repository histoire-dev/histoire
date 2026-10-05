# 19 — Save settings to the project config

## Outcome and prerequisites

Depends on: 12, 18. Dev only.

Settings sections that mirror project options show where each value comes from (default, project config with file:line, or local override) and offer "Save to project" and "Reset to project". Saving edits the project's TS/JS config through the slice 18 codemod. If the option is computed in code (variable, import, function), the UI explains why it can't be saved and offers "Copy snippet" with the value to paste manually. Local-only preferences (density, zoom sync, panel state) never touch project files.

## Owned files

- Add `packages/histoire/src/node/server/ui-channel/config.ts` handling `histoire:ui:config-read`, `histoire:ui:config-save`, and replying with `histoire:ui:config-state` (see [contracts](contracts.md)).
- Add `app/stores/project-config.ts` (per-path status from the server) and `app/components/pages/settings/{ProjectSourceBadge,SaveToProject}.vue`.
- Update settings sections from slices 12 and 16 (viewports, backgrounds, appearance default scheme, default arrangement, agent presets without env, agent permissions).

## Tests first

1. Opening Settings requests status for the visible section's paths; badges show `default`, `project (histoire.config.ts:12)`, `local`, or `computed in code`.
2. Saving viewport presets calls `editConfig` with only allowlisted paths; the server rejects any other path.
3. Computed paths disable Save and show the reason from `analyzeConfigPath`; Copy snippet produces valid TS/JS for that option.
4. No config file: Save creates one via `createConfig` and reports its path.
5. Agent presets save `command`, `args`, `cwd`, `default` only; `env` is rejected (user-level storage per slice 16).
6. After saving, the existing config watcher restarts the runtime once; the saved local override is cleared so the project value becomes the source; no reload loop.
7. Hash mismatch (file edited externally) returns a conflict; the UI re-reads status.
8. Static builds include none of this code.

## Implementation steps

1. Server owns all file access; the client sends section patches and receives statuses.
2. Serialize writes through the same queue as other UI-channel file writers (comments, screenshots).
3. Show a short diff preview (changed lines) in a confirm popover before writing.

## Failure paths

Write or parse failure leaves the file untouched and shows the error with location. A config that fails to load after an edit restores the session backup from slice 18 and reports it.

## Validation commands

~~~bash
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter @histoire/app build
pnpm --filter histoire-example-vue3 test:examples
~~~

Manual: in a scratch copy of `examples/vue3`, save presets from Settings, confirm a minimal git diff in `histoire.config.ts`, then make `responsivePresets` an imported constant and confirm Save is refused with a snippet offered.

## Acceptance criteria

- Saving from Settings produces minimal, formatting-preserving edits to the project's TS/JS config and survives restart.
- Computed options are never rewritten; secrets and local-only preferences never reach project files.

## Non-goals

Editing arbitrary config keys, editing function-valued options, editing Vite config.

## Handoff

Section → allowlisted path map for future settings sections.
