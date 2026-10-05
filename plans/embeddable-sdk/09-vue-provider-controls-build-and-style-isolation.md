# 09 — Vue provider, controls build, and style isolation

## Outcome and prerequisites

Depends on: 08.

Vue hosts use native provider/panels around isolated previews with one host Vue runtime and scoped UI. Standalone reusable UI builds with existing vendor runtime. [public-api.md](public-api.md) owns component/composable exports and provider ownership.

## Owned files

- Add packages/histoire-vue/src/{index,provider/*,composables/*,components/preview/*,foundation/*,styles/*}.
- Implement HistoireProvider, useHistoireSession, useHistoireSnapshot, HistoirePreview, HistoireVariantGrid; later slices add remaining exports.
- Add controls vite.peer.config.ts, peer declaration configuration/bootstrap, and @histoire/controls/vue export map in existing packages/histoire-controls.
- Reuse controls/src component sources. Extend controls build scripts to produce vendor and host-peer builds without overwriting either.
- Extract app shared base/layout/theme primitives and adjust app prebundle aliases/CSS generation/copy configuration.
- Add Vue provider/SSR-import/control-reactivity tests and browser vue-host-isolation.spec.ts.

## Tests first

1. Host Vue reactive state works with controls peer build; generated declarations/runtime imports use normal vue, not @histoire/vendors/vue.
2. Import native package without DOM. No app/plugin/router/Pinia install, document style mutation, or global FloatingVue configuration.
3. Mount two providers/sessions beside host router and form controls. Selection, overlays, focus, and theme stay local.
4. Unmount provider/child; only child-created frame/subscriptions removed. Caller session remains usable until caller dispose.
5. Competing native preview/grid honors session primary reservation; native ready is isolated runtime readiness.
6. Browser interaction/visual inspection verifies host CSS/layout unaffected, container resizing, dark mode, and local overlays. No style/class assertion tests.

## Implementation steps

1. Provide explicit session and root/overlay ownership through Vue injection. Missing provider fails clearly; children call composables directly without prop drilling/global active session.
2. Implement snapshot composable via subscribe and scoped disposer. Provider never disposes caller session, but registers child cleanup so provider unmount cannot leak resources.
3. Preview/grid wrappers mount SDK-owned source frames inside provider container. Keep execution isolated on Histoire origin and reuse slice-08 primary adapter.
4. Build controls from same sources twice. Existing default keeps vendor aliases; /vue externalizes host Vue and emits peer-compatible declarations. Resolve actual VueUse/FloatingVue dependencies explicitly for peer build rather than relying on hidden vendor re-exports.
5. Declare host Vue peer compatible with currently supported Vue 3.5 line; compile against workspace Vue 3.5.26. Test package metadata/version compatibility in slice 15.
6. Reusable app UI is bundled under existing vendor aliases for standalone. Review app prebundle externalization so shared Vue package sources compile into one coherent vendor graph rather than loading host Vue beside vendor Vue.
7. Split document reset styles from reusable provider-root styles. Explicit native stylesheet export contains no global html/body/input/link resets or host dark-mode mutations.
8. Scope variables, typography, layout, responsive behavior, and transitions under provider root. Measure root container via ResizeObserver; cleanup observer.
9. Use root-owned overlay target with local FloatingVue components/directives. Do not call global plugin configuration or install host app plugin.
10. Keep module import SSR-safe; DOM/runtime mounting starts on client lifecycle only. Mark CSS side effects correctly in export metadata.

## API changes

Enable native foundation exports and @histoire/controls/vue. Provider/session lifecycle and explicit stylesheet import follow public-api.md. Remaining components are exported when implemented; no placeholder success views.

## Failure paths

Missing provider, SSR mount, failed source/runtime ready, and primary collision expose useful errors. Provider teardown observes async unmount failure. Peer runtime mismatch blocks package gate; never silently fall back to vendor Vue in host.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/controls build
pnpm --filter @histoire/controls test
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration vue-host-isolation preview-grid
pnpm run lint
~~~

Updated controls build includes peer output. Verify native host and standalone prebundle separately; one passing graph cannot prove other.

## Acceptance criteria

- Host needs no Histoire aliases/vendor Vue/router/Pinia/plugin installation.
- Peer controls reactivity, SSR-safe imports, two providers, cleanup, and native preview parity proven.
- Scoped visual/theme/container/overlay behavior verified in browser.
- Standalone vendor graph remains one Vue runtime.

## Non-goals

Custom-controls runtime/overlay relay, all panel implementations, host story rendering, SSR story execution, and new design system.

## Handoff

Provide injection/cleanup/overlay/root APIs, CSS exports, peer build/declaration paths, bundling decisions, and host/standalone graph evidence. Slices 10–14 use same foundation and must not reintroduce document/global state.
