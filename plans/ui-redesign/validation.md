# Validation and acceptance matrix

## Implementation evidence

This matrix defines required acceptance; it does not claim those checks passed. [Implementation validation](implementation-validation.md) records executed commands, browser observations, and remaining limits. The original delivery was a documentation-only plan pack; the later implementation request authorizes source/dependency changes. Commits, pushes, and publication remain separately authorized actions.

Check local documentation links, slice numbering, dependency graph, trailing whitespace, and final newlines directly (`git diff --check` skips untracked file bodies).

## Baseline (refresh when implementation starts)

Record before slice 01: app build, core unit tests (`packages/histoire/src/node/__tests__`), controls tests, lint, and Cypress `test:examples` for vue3, svelte4, nuxt4. The embeddable SDK plan recorded three pre-existing failing test files (`test-lifecycle`, `test-specs`, `test-targeting`) on this commit; confirm whether they still fail and do not count them against this work.

## Where tests live

- App logic (stores, composables, layout math, pointer handling): existing core runner in `packages/histoire/src/node/__tests__/`; co-located app specs run through that runner explicitly. No new app test runner is introduced.
- Node services (UI channel, ACP, comments, build metadata): `packages/histoire/src/node/__tests__/` with the shared fixtures already used by MCP tests; do not duplicate fixtures.
- End-to-end: Cypress specs in `examples/vue3/cypress/e2e` (primary), with smoke coverage in svelte4 and nuxt4.

## What tests must prove

Behavior, not styling. No class/style/snapshot assertions. Use visual inspection against the supplied [light/dark PNGs](design-reference.md) for look and feel.

| Area | Slice | Proof |
| --- | --- | --- |
| Tokens/icons | 01 | Theme overrides still produce CSS variables; no network request to Iconify or Google Fonts in a static build |
| Shell | 02 | Pane switching, panel collapse, inspector close/reopen persist; static build hides dev panes; route contract unchanged |
| Tree | 03 | Variants listed under the open story; filter; folder state persists with existing key; keyboard navigation |
| Canvas | 04 | Pan by Space+drag, middle mouse, and hand tool; zoom anchors under cursor; frame budget respected; selection syncs `variantId`; collect error shows last good render |
| Toolbar | 05 | Each tool changes the expected setting and preview message; measure returns element metrics; popovers close on Escape/outside click |
| Inspector | 06 | Tabs map to `tab` query; props edits reach the frame; source drawer shows dynamic/static source; events/tests badges |
| Matrix | 07 | Axis selection, value filtering, base props override every cell, PROPS_OVERRIDE round trip, URL restore |
| Search | 08 | Scopes, ranking parity with Fuse index, canvas highlight, ⌘K still opens |
| Tests pane | 09 | Filters, run all, run one, stale marking, collect errors |
| Home | 10 | Static home renders without dev services; dev home adds dev sections; build metadata present/absent |
| Markdown | 11 | Outline anchors, embedded live variants, no canvas tools |
| Settings | 12 | Each section reads/writes its store; config defaults vs user overrides; static build hides dev sections |
| Menu/shortcuts | 13 | Right-click on frame opens menu with correct target; shortcuts registry conflicts detected; focus traps |
| Screenshots | 14 | Request through UI channel uses the shared execution lane; missing Playwright yields a clear unavailable state |
| MCP pane | 15 | Snapshot/upsert events reflect MCP operations; cancel reaches the queue; follow mode moves selection |
| ACP | 16 | Agent spawn/stop lifecycle, permission prompt round trip, env never written to project files |
| Comments | 17 | CRUD persisted atomically; element pick; send to agent with context; status transitions; static build has no comments |
| Config codemod | 18 | Byte-minimal edits on supported shapes; documented refusals for computed values; created configs load; config loading unchanged |
| Save to project | 19 | Source badges; allowlist enforced server-side; computed values refused with snippet; conflict on external edit; no secrets written |

## Commands

Build dependencies before tests that read compiled output.

~~~bash
pnpm -r --filter @histoire/protocol --filter @histoire/shared \
  --filter @histoire/sdk --filter @histoire/controls --filter @histoire/vue \
  --filter @histoire/app --filter histoire --filter @histoire/plugin-vue \
  --filter @histoire/plugin-svelte --filter @histoire/plugin-nuxt \
  --filter @histoire/plugin-react build
pnpm --filter histoire test
pnpm -r --filter @histoire/protocol --filter @histoire/sdk \
  --filter @histoire/vue --filter @histoire/controls test
pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/tsconfig.workbench.json
pnpm run lint
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
pnpm --filter histoire-example-nuxt4 test:examples
pnpm run docs:build
~~~

## Manual acceptance per slice

Run `pnpm --filter histoire-example-vue3 story:dev` and `story:build && story:preview`. Compare against the matching canvas boards in both themes at 1440×900 and at a narrow width (≤ 640px). Record what was checked in the slice handoff.
