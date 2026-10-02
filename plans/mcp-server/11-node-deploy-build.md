# Slice 11 — Standalone Node.js deployment build

## Outcome and prerequisites

Build infrastructure creates portable Node artifact layout, private MCP snapshot, and runtime bundle writer. Depends on 01, 03, 04, 05, and 07; endpoint defaults use 07's config contract. Static remains default. This slice tests writers/bundler with dedicated test entry; slice 12 supplies actual production entry and wires public histoire build --target node workflow. No dependency on unfinished production server is hidden in this foundation slice.

## File ownership

- Modify `packages/histoire/src/node/{build/index.ts,build/vite-config.ts,build/output.ts,build/collect.ts}` for explicit output/layout helpers, retaining static command default. CLI bin/commands target wiring is owned by 12 after production entry exists.
- Modify `packages/histoire-shared/src/types/config.ts` and core config defaults/merge only for target/includeSource options.
- Add `packages/histoire/src/node/build/node/{target,layout,snapshot,content,manifest,bundle,package,publish}.ts`.
- Add `packages/histoire/src/node/deploy/{artifact-schema,artifact-version}.ts` with server-only validation shared by writer/reader; no dev imports.
- Extend build serialization tests; add `packages/histoire/src/node/__tests__/mcp/{node-build,node-manifest,node-bundle}.spec.ts`.
- Use existing esbuild dev dependency for standalone server bundling; no new global build tool or runtime transpiler.

## Tests first

1. Existing static build retains root index.html/__sandbox.html/histoire.json layout, plugin callbacks, and ordinary static browser behavior. Target-selection/output writer tests produce Node server.mjs/package.json/public/private layout from test entry; CLI production target proof belongs to 12.
2. Node private manifest includes collected docs omitted by current histoire.json, exact IDs, raw/virtual source hashes, base/router/appearance, and embedded-test capability. No absolute paths, config functions, environment, bearer token, arbitrary meta/frontmatter, or unregistered files.
3. includeSource:false removes private raw source and marks source unavailable without changing existing UI Source panel. DocsOnly/standalone Markdown/source outside root follow established catalog policy.
4. Source edited during build fails inconsistent snapshot instead of mixing old collected metadata with new source. Same completed build inventory gives same buildId; changed content/settings changes buildId.
5. Failed runtime bundle/manifest validation/plugin hook leaves previous valid output intact and deletes only owned staging directory. Target assets are not accidentally emptied after private manifest written.
6. Bundled server import graph contains no Vite, vite-node, project config loader, framework source compiler, dev watcher, or project Vitest Node runner. Optional Playwright stays external; server read path needs only Node/artifact.

## Implementation steps

1. Define build.target default static, build.node.includeSource default true, and target-selection helper supporting CLI override. Validate unsupported values. Public CLI/config activation is wired in 12 when production entry available. Keep ConfigMode build/dev unchanged; deployment target selects output, not runtime config evaluation.
2. Introduce explicit output layout passed into build helpers. Node browser assets go to staging/public; static assets remain configured outDir root. Do not mutate ctx.config.outDir halfway through plugin hooks or let existing forced Vite outDir erase private output.
3. Reuse existing scan, Markdown renderer, collection, app bundle entries, sandbox HTML, and static mock-worker emission. Snapshot comes from captured collected context/content index; do not parse histoire.json or execute source twice to recover omitted docs.
4. Capture source/docs identity/content before collection and revalidate before final packaging. Hash exact content using 04 bounded allowlist reader. If any captured story/docs changed, fail build with relative-path diagnostic; no fuzzy merge or automatic build replay of plugin side effects.
5. Write private content as hash-named UTF-8 blobs, deduplicated by SHA-256. Manifest inventory references only relative digest paths and exact bytes/kind/hash; source excluded if includeSource:false or outside canonical project root. Catalog metadata projects known fields; no raw Context serialization.
6. Manifest schema version 1 records buildId, build/base/router/preview settings, stories/docs/source inventory, endpoint enabled default, and actual embedded-test runtime inclusion. BuildId hashes canonical stable manifest payload plus public asset inventory, not timestamps, credentials, or deployment origin. Runtime revision/epoch are assigned at server startup, not serialized as live dev handles.
7. Implement bundleNodeRuntime(entryFile, outputPath) using esbuild platform node/ESM, target node22. Unit fixture entry exercises SDK/Zod/shared helper bundling; slice 12 supplies real production entry. Only Node builtins/optional Playwright may remain external. Fail on accidental dev-only import or unsupported dynamic require. Generated bundle may exceed 300 lines; authored source modules remain below 300. Never publish test fixture entry as real deployment.
8. Generate minimal private ESM package.json with Node >=22 and start script. Optional Playwright version derives from tested supported package version when browser capability desired; no Vite/Histoire/framework/project dependency. Explicit browser install belongs to deployment setup, not Node artifact startup.
9. Bundle contract requires production boot entry supplied in 12 to set NODE_ENV=production when absent, read runtime environment only, and start listener only on direct invocation. Import exposes validation/factory functions without listening. Never import CLI bin.ts (currently sets NODE_ENV=development). No token/origin baked into assets/manifest.
10. Plugin preview callbacks receive public built root through explicit optional parameter to renderPreviewStories/startPreview helper; preserve default static call signature. Execute build hooks once with normal semantics. Runtime does not rerun onBuild/onDev/onPreview.
11. Validate artifact inventory and generated ESM import before publication. Publish staging into configured outDir with backup/rollback if replacing previous output; delete only build-owned paths. Directory replacement is transactional with rollback, not claimed gap-free atomic swap of nonempty directories. Build output changes require production process restart; do not hot-update running artifact directory.
12. Split build/index.ts coordinator if additions push it above 300 lines; keep target-specific code under build/node. Shared serializer stays compatible; private schema remains server-only.

## Acceptance and validation

Node manifest/content/writer/bundler tests with test entry, unchanged static build serialization/browser tests, shared/core/workspace builds, focused lint. Validate portable inventory/writer independently of production entry. Actual generated server copied outside project and source-free runtime proof belong to 12/14; no runtime claim from test bundle.

## Non-goals and handoff

No SSR, Vite dev server in production, project node_modules copying, framework compiler at runtime, runtime source edits, live cloud deploy, or static-hosting MCP. Handoff is versioned artifact schema/layout, safe staging/publish writer, standalone production entry seam, and unchanged static output proof.

## Implemented foundation and verified evidence — 2026-10-02

- `build(ctx, { target?, nodeEntryFile? })` supports explicit target precedence and requires supplied production entry before a Node artifact can be published. Slice 12 owns CLI/config activation with its real boot entry. Static output retains existing root layout; Node browser output is explicit staging `public/`, without mutating `ctx.config.outDir` or plugin configuration.
- `captureNodeBuildInputs(ctx)` captures bounded registered source and physical Markdown hashes before collection. `createNodeBuildSnapshot(ctx, inputs)` revalidates identities after collection/build/hooks and after final catalog capture; content changes fail with relative-file diagnostics. Snapshot copies exact allowlisted catalog fields, preferred docs, source omission state, preview settings, MCP default and validated test timeouts. Outside-root metadata remains valid while private source remains unavailable.
- `artifactManifestSchema` and `ArtifactManifest` in `deploy/artifact-schema.ts` define schema version 1. Source/docs refer to `content/<sha256>.txt`; manifest `contents` and `publicAssets` carry exact hashes/byte lengths. General catalog metadata can retain parent segments; artifact storage paths cannot. Base validation uses shared canonical `normalizePreviewBase`. Canonical `createArtifactManifest` includes actual Histoire version and sorted inventories in stable build identity.
- `createNodeBuildLayout(outDir)`, `assertNodeOutputSafe(root,outDir)`, `writeNodeArtifact(options)` and `publishNodeArtifact(layout)` isolate owned staging, reject replacing project/ancestor even through symlink aliases, verify source blob digests, package minimal ESM metadata, validate native generated import in an owned fresh Node process, and replace prior output using backup/rollback. Cleanup failure after committed publication reports that new artifact is valid and prior backup remains; it does not claim rollback.
- `bundleNodeRuntime(entryFile,outputPath)` bundles SDK/Zod/shared runtime for Node 22 ESM; checks relative/resolved import graph against dev config/controller/Vite/Vitest/project compiler boundaries and permits only Node builtins/optional Playwright externals. Existing `esbuild:^0.27.2` moved from devDependencies to dependencies so packaged CLI can build without development dependencies; existing resolution preserved.
- Collection server closes after plugin/acquisition/collection/build failures; hybrid collector and preview callback server close in `finally`. Preview callbacks use explicit public output root and run once per normal build. `includesEmbeddedTestRuntime(result)` derives deployed test capability from emitted variant-session and Vitest spy/mocker modules.
- Focused six-suite gate passed **28 tests** on Node 24.21.0 and Node 22.23.1: `node-artifact`, `node-build`, `node-build-cleanup`, `node-bundle`, `node-manifest`, existing `build-serialize`. Shared/core builds passed, focused ESLint had zero errors and one existing build logger warning, frozen offline lockfile-only install passed.
- Real temporary Vue fixture on Node 22.23.1 completed static build, Node foundation build with dedicated fixture entry, and controlled failing build hook. Verified static root layout, Node public/private separation, Markdown docs, actual `testRuntimeIncluded:true`, unchanged configured output root, preview callbacks fetching emitted sandbox HTTP 200, previous Node manifest retained after hook failure, removed owned staging, and natural process exit. Local preview required sandbox escalation after `listen EPERM`; authorized rerun passed. Fixture was deleted. This proves build foundation, not production entry or copied deployment runtime; slices 12/14 own those gates.
