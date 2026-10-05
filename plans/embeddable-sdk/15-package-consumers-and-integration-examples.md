# 15 — Package consumers and integration examples

## Outcome and prerequisites

Depends on: 14.

Published package shape works in clean external consumers with no repo aliases. Examples demonstrate iframe/native/Node integration, multiple sessions, and explicit runtime. [public-api.md](public-api.md) owns import/API shape; [validation.md](validation.md) owns evidence standards.

## Owned files

- Finalize protocol/SDK/Vue/controls/Histoire export maps, files lists, dependencies/peers, types, CSS exports, and runtime asset copying.
- Add examples/embed-vanilla/ as histoire-example-embed-vanilla with plain TypeScript/browser host.
- Add examples/embed-vue/ as histoire-example-embed-vue with native provider/parts.
- Add examples/embed-node/ as histoire-example-embed-node with caller HTTP API/WebSocket and Histoire middleware.
- Reuse existing Vue/Svelte/Nuxt/source fixtures rather than copying story catalogs into each example.
- Extend examples/nuxt4 (or add one sibling Nuxt example if the existing one must stay on Tailwind 3) with Nuxt UI 4, Tailwind v4 through its Vite plugin, and @rstore/nuxt: one story using UApp/UButton/useToast/useAppConfig and an rstore query on an in-memory fixture plugin installed by story setup (factory H1, [factory requirements](../factory-requirements.md)). Fix @histoire/plugin-nuxt peer range (currently `nuxt ^3.0.0-rc.11`) to the tested Nuxt 3/4 lines.
- Add core consumer script/config and test:embed:consumers; one package staging/packing helper under existing shared test utilities.
- Add per-example README/package scripts and small scenario modules.

## Tests first

1. Locally pack complete dependency closure, install in temporary consumer outside workspace, compile imports/types, and build/run browser host without workspace aliases/symlinks.
2. Plain JS/TS SDK graph contains no Vue/app/Vite/Node runtime modules. Check executable bundle and declarations, not package.json alone.
3. Native Vue consumer uses one host Vue, @histoire/controls/vue, explicit CSS, lazy sanitizer/highlighter, and shipped frame/runtime assets.
4. Node consumer imports histoire/node from unrelated cwd; dev/middleware/read workflows require no optional browser-test installation until tests explicitly run.
5. Copied static book and nested base serve every declared lazy asset; no missing file from package files list.
6. Consumer cleanup leaves host HTTP/WebSocket running, sessions disposed, and no active Histoire listener/timer.
7. Nuxt UI example embedded cross-origin from the vanilla host: dev, static build under `/_stories/`, and Node build render the Nuxt UI/rstore story without network calls; colorScheme dark applies Nuxt UI dark styles; installed plugin-nuxt peer metadata accepts the tested Nuxt version.

## Implementation steps

1. Finalize package entries/types using built output. Export native stylesheet explicitly; mark CSS side effects. Keep protocol/SDK pure and first-party internal adapters documented unsupported for external loaders.
2. Plain TypeScript example connects source and mounts explorer or independent surfaces. Demonstrate separate sessions for simultaneous primaries and explicit hidden preview for runtime-dependent operations.
3. Vue example composes tree/search/toolbar/controls/docs/source/events/tests around preview/grid with caller-owned session. Include root sizing/theme/overlay ownership and explicit connect/dispose.
4. Node example constructs project from explicit root, obtains middleware handle, attaches to caller server, starts server, awaits ready, and closes only Histoire handle/project. Include host API and unrelated WebSocket route.
5. Examples consume existing source book URL/root through explicit setup; no implicit dependency installation or arbitrary loader adapter.
6. Pack locally without publishing. Stage manifests/dependency versions in temporary directory through shared helper; never rewrite source manifests merely to satisfy external install.
7. Install all required local tarballs in external fixture without current repo node_modules resolution. Validate package peer metadata and controls legacy/peer entries independently.
8. Run consumer type/build/browser/Node probes and inspect shipped assets. Test both dev source and static nested output.
9. Document failure states and runtime requirements through concrete examples; keep UI free of implementation filler.

## API changes

Finalize already defined public entries: @histoire/protocol, @histoire/sdk, @histoire/vue, histoire/node, @histoire/controls/vue. No newly public source-loader/plugin/transport extension point.

## Failure paths

Missing declaration/CSS/chunk, undeclared dependency, duplicate Vue, accidental platform import, incompatible peer, or workspace-only resolution blocks gate. Optional test dependencies remain explicit errors when tests requested. Package pack success alone does not prove install/runtime.

## Validation commands

~~~bash
pnpm run build
pnpm --filter histoire test:embed:consumers
pnpm --filter histoire-example-embed-vanilla build
pnpm --filter histoire-example-embed-vue build
pnpm --filter histoire-example-embed-node build
pnpm --filter histoire test:embed:integration independent-panels explorer-standalone
pnpm run lint
~~~

Add those example scripts before use. Consumer gate performs local pnpm pack/install only in owned temporary paths; no package publication.

## Acceptance criteria

- Clean packed TypeScript, Vue, and Node consumers compile/build/run without repo aliases.
- One host Vue, pure browser SDK, explicit runtime, types/CSS/assets/peers verified.
- Examples demonstrate independent/multiple sessions and HTTP ownership.
- Existing default controls/package/CLI imports retain compatibility.

## Non-goals

Publishing, version release, source manifest rewrites for test install, external loader API, React/Web Component adapters, and standalone Node deployment/auth implementation.

## Handoff

Provide tarball/dependency closure, consumer install/build/browser evidence, examples/import/CSS entry points, and actual bundle graphs. Slice 16 converts repeatable consumer probes into CI/release gates.
