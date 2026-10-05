# 14 — Explorer and standalone adoption

## Outcome and prerequisites

Depends on: 10, 11, 12, 13.

Compose explorer entirely from reusable parts; standalone becomes explicit adapter around same session/UI. Retain existing routes/plugins/frameworks and chooser behavior. [architecture.md](architecture.md) owns adoption strategy; [public-api.md](public-api.md) owns slots/visibility/session contract.

## Owned files

- Add Vue components/explorer/{HistoireExplorer,ExplorerNavigation,ExplorerPanels}.vue with slot/context helpers.
- Adapt app/{index.ts,App.vue,router.ts,plugin.ts,api.ts} and current story/settings/events/tests stores to reusable session/UI.
- Add app/adapters/{source,navigation,plugin,persistence,document}.ts.
- Remove hidden host-side story mounting/metadata execution only after all dependent runtime services migrated.
- Preserve bundle-main.js/bundle-main-dev.js startup compatibility and explicit mount entry.
- Add core standalone-selection.spec.ts, standalone-navigation.spec.ts and browser explorer-standalone.spec.ts, explorer-slots.spec.ts.

## Tests first

1. Existing history/hash/deep links, invalid target handling, query panels/docs anchors, back/forward, and remembered variants remain compatible.
2. Unseen multi-variant standalone story retains chooser; sole/remembered variant selects automatically. SDK omitted variant still chooses first. Docs-only story has no fabricated variant.
3. Explorer slots/visibility compose custom navigation/toolbar/preview/panels. Preview slot does not accidentally reserve duplicate primary.
4. Mount two embedded explorers beside host router/title/theme/shortcuts; host state unaffected and sessions independent.
5. Explicit target mount/unmount/remount cleans resource/subscriptions; legacy bundle still mounts #app.
6. Preserve plugin API/custom commands, controls/mock/dynamic-source/test behavior, Nuxt/Svelte/Vue/vanilla support, and source-dev CSS.
7. Read legacy standalone preference keys with correct migration; embedded opt-in keys remain isolated.

## Implementation steps

1. Compose explorer from shared provider/parts. Avoid duplicated tree/control/docs/test implementations or explorer-required singleton.
2. Implement navigation/toolbar/preview/panels slots and visibility defaults per public-api.md. Default preview claims primary; custom preview slot owns its resource.
3. Build standalone local source/session adapter from shared catalog/content/preview services. Local app imports first-party adapter seam; browser SDK still imports no virtual app modules.
4. Isolate router adapter translating URL to structured selection and back. Use explicit null for standalone multi-variant chooser while preserving valid remembered/sole choice. Avoid navigation feedback loops.
5. Make app mount target explicit and return async unmount handle. Existing bundle bootstrap passes #app; source-dev bootstrap keeps matching aliases/styles.
6. Move document title, URL, standalone keyboard commands, and legacy persistence into standalone adapters. Embedded explorer never performs those effects.
7. Adapt existing Pinia stores to session where still needed for app/plugin compatibility. Do not keep second canonical selection/state/event/test controller.
8. Preserve plugin API/hook/custom command surfaces through app adapter, without opening arbitrary plugin event bridge to external hosts.
9. Audit host-side story imports: docs/raw source from data services, dynamic source/tests/controls/rendering/metadata from isolated ready runtime. Remove old hidden mount only after all consumers use replacement.
10. Read/migrate legacy standalone preferences once with existing semantics. Do not apply standalone keys to embedded sessions.
11. Verify prebundled shared UI uses existing vendor aliases and one Vue runtime; native host path remains peer build.

## API changes

Enable HistoireExplorer and explorer iframe surface. Public embedded explorer/session APIs unchanged. Existing internal app mount becomes target-aware with cleanup while preserving default bundle behavior.

## Failure paths

Invalid URL target yields existing usable navigation/error behavior without corrupt selection. Missing source/runtime capability stays explicit. Slot teardown/late router resolution cannot affect replacement. Legacy storage failure falls back gracefully. Plugin regression blocks migration; do not remove old execution before equivalent runtime service exists.

## Validation commands

~~~bash
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm run build
pnpm --filter histoire test src/node/__tests__/embed/standalone-selection.spec.ts src/node/__tests__/embed/standalone-navigation.spec.ts
pnpm --filter histoire test:embed:integration explorer-standalone explorer-slots
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
pnpm --filter histoire-example-nuxt4 test:examples
pnpm run lint
~~~

Probe HISTOIRE_DEV=true separately; bundled dev success alone does not validate source-development path.

## Acceptance criteria

- Standalone and embedded explorer share same reusable parts/controller/runtime.
- Routes/chooser/docs-only/preferences/plugins/frameworks and source-dev behavior preserved.
- Independent explorers/slots/unmount do not mutate host state.
- No host-side story execution remains for migrated metadata/docs/source/controls/tests.

## Non-goals

Changing story/plugin syntax, forced host router integration, redesigning standalone preferences, and replacing all Pinia solely for stylistic reasons.

## Handoff

Provide standalone adapters, route/null-selection rules, legacy migration, removed host execution inventory, slot ownership, and framework/browser evidence. Slice 15 packages actual reusable implementation; slice 16 validates full matrix.
