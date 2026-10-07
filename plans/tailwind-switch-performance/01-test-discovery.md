# Slice 1: eliminate known-empty hidden collection

## Contract

First-party generated Tailwind stories contain no test registrations. Auto collection currently enters `createVariantTestSession.collectVariantTests`, bootstraps and mounts a full hidden variant via `createVariantSession`, then destroys it. Eliminate that work only when authoritative built-in generation proves no tests exist. Keep automatic collection and ordinary dynamic registrations intact. Do not use story id `tailwind`, a title/path heuristic, or absence of catalog test hints as proof.

## Implementation

Inspect `builtin-plugins/tailwind` generation/module identity, vanilla-support metadata, `virtual/variant-test-session/{index,story-modules,types,session}.ts`, and existing collection fixtures. Choose smallest private trusted marker or existing generated metadata boundary; no new wire/public SDK API or user option. Validate story and variant existence normally before returning empty definitions. Preserve source invalidation, serialization, exclusive execution queue, and run/collect consistency. A marker must not leak to user-controlled ordinary story declarations by accident. Coordinate edits to `runtime/story.ts` with slice 2, which also owns Tailwind generation changes.

## Tests first

Use existing session fixtures. Prove generated test-free story collection does not invoke bootstrap/render mount; repeated collection and invalidation remain correct. Prove ordinary stories still collect module, setup, and render registrations including stories without catalog test hints. Unknown story/variant must retain existing error semantics. Run affected test-session and Tailwind suites.

## Completion

`createTailwindStory()` marks its returned options object in a private `WeakSet` from `node/generated-story-metadata.ts`. The test session only skips collection when that exact object is marked and its import-time registration list is empty. No marker is serialized into catalog/story metadata, and no wire field or public SDK API was added.

The shortcut also requires a private runtime probe of actual vanilla setup hooks. Runtime session options default to disabling the shortcut. Preview and Vitest harness generation enable it only for trusted marked stories with no import-time registrations; the probe lazily imports generated and configured setup modules inside the existing test registry and checks whether either exposes `setupVanilla`. Generated setup exports private `hasSetupVanilla` metadata computed from its actual imports, since its wrapper function exists even when none of those imports define a vanilla hook. Vue-only `setupVue3` modules therefore remain eligible. Probe failures conservatively use the mounted path. A marked raw story or any raw variant with `setupApp` also uses the normal mounted collection path, so those hooks can register tests. The probe adds no serialized metadata or public API.

If a first lazy setup-module import emits module-scope registrations, the probe captures them in the active registry and forces the normal mount path. The story-module cache retains these registrations for that story across repeat collection and source invalidation, because native ESM caching will not emit them again. This preserves existing per-story capture semantics; setup callbacks themselves continue to run through the ordinary mount path.

The shortcut stays inside `collectVariantTests()`. It loads and maps the story module, validates the requested variant through the same `getStoryVariant()` function used by bootstrap/render mounts, then returns empty definitions without calling either mount. A prepared mapped story file is reused if the guard declines the shortcut, avoiding a duplicate module mapping. Run and explicit test-case flows still mount normally. Source invalidation drops the module object, so the next collection re-evaluates its marker and registrations.

Focused coverage in `variant-test-session/known-empty.spec.ts` proves cached repeated collection avoids both mounts, invalidation discovers newly registered tests, module registrations override the marker, actual vanilla setup hooks and story `setupApp` fall back to mounted collection, Vue-only setup remains eligible, setup-module registrations survive repeated collection and source invalidation, ordinary module/setup/render registrations still collect without `hasTests` catalog hints, explicit runs still mount, and unknown story/variant errors remain intact. `variant-test-session/setup-hooks.spec.ts` covers generated hook metadata, Vue-only setup, configured vanilla setup, conservative missing metadata, sequential lazy imports, and probe failure fallback. `test-harness.spec.ts` and `preview-runtime.spec.ts` verify the private probe is wired into both runtime callers. `tailwind/known-empty.spec.ts` checks the marker is attached by the actual generated Tailwind story factory and ordinary story objects remain unmarked.

Validation: focused Vitest command covering `variant-test-session`, Tailwind, test-harness, preview import, and preview runtime suites passed **19 files, 87 tests**. No package build was run in this slice. The parent owns final dev/static performance comparison; do not claim global test discovery optimization beyond authoritative generated Tailwind stories.
