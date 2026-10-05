# 20 — Automatic props matrix detection

## Request and outcome

User extension to slice 07, requested 2026-10-04. Implement automatic matrix discovery for existing stories without requiring `:matrix` declarations. User explicitly requested planning by one subagent and implementation by another; this document is the planning handoff.

A story with two usable finite prop domains enables **Props matrix** automatically. Existing runtime Boolean definitions, runtime enum/value lists, and top-level Boolean variant state provide reliable domains. Explicit story hints remain supported and override automatic domains. Entering Matrix chooses sensible axes, retains ordinary selection and controls ownership, and renders isolated previews through the existing frame budget.

The implementation must include automatic discovery before a frame is selected when an already admitted passive preview supplies metadata for the first variant. It must not execute additional story previews for detection.

## Repository evidence

Current implementation already has part of this behavior, but tests and examples conceal important gaps:

- `packages/histoire-app/src/app/util/matrix.ts::discoverMatrixAxes` reads `_hPropDefs`, recognizes Boolean types and `values`, and applies story hint overrides. It does not inspect top-level Boolean state. Its first-owner rule currently applies only after an eligible axis is found, which can misidentify a later component with the same prop name.
- `packages/histoire-plugin-vue/src/client/app/auto-props.ts` projects primitive constructor types, current scalar values, and `prop.values ?? prop.enum` into `_hPropDefs`. This is actual runtime metadata; Vue `String` does not carry the source TypeScript literal union.
- `packages/histoire-shared/src/types/story.ts::PropDefinition` already has `types`, `value`, `default`, and `values`. No additive wire field is needed.
- No Vue/Svelte/React source union extractor or docgen pipeline exists in these support plugins. Svelte and React do not publish Vue-style `_hPropDefs`; their existing explicit state mirrors can provide top-level Booleans.
- `packages/histoire-app/src/app/stores/matrix.ts` selects the first two axes, gates availability on axis count, and synchronizes from a snapshot without checking exact state/runtime/selection ownership or source generation.
- `standalone/workbench.ts` owns matrix synchronization independently of Matrix rendering. `MatrixView.vue` also synchronizes; preserve one clear authority or make both consume the same guarded model.
- In chooser mode, canonical selection has `variantId: null` and no selected-state mirror. Grid passive previews already own real sessions and current state in `CanvasReplicaPreview.vue`. Those previews can supply observational metadata without changing canonical selection.
- `components/canvas/frame-state.ts::targetGeneration` already computes the executable generation from source URL/source ID/epoch and story `runtimeRevision` (fallback source revision). Reuse this contract rather than introducing a second generation definition.
- `MatrixCell.vue` registers its target once at setup. A base preset change can leave its registry target on the previous variant. `CanvasReplicaPreview.vue` embeds a full cell key in a bounded wire request ID. Fix these directly relevant matrix defects in this extension.
- `examples/vue3/src/components/WorkbenchMatrix.story.vue` hardcodes two Boolean hints, despite `WorkbenchMatrix.vue` declaring both Booleans. Removing those hints provides a real automatic-discovery acceptance fixture.

## Ownership and non-goals

Planning agent owns this document only. Implementation agent owns the files listed below, associated focused tests, fixture changes, and matrix documentation. Root coordinates builds, full typechecking, browser validation, and integration with concurrent agents.

Do not edit measure/picker modules, pane resize modules, test runner/list modules, or native preset UI. Preserve unrelated dirty changes. No stage/commit/push.

Non-goals:

- TypeScript source analysis, validator execution, parsing validators, or guessing literal unions from strings/defaults/examples.
- Inferring numeric ranges, sampling arbitrary string values, recursively treating nested state as prop axes, or evaluating functions/getters.
- Observing opaque custom-control option values or guessing how a custom control maps to a prop.
- More than two axes, creating catalog variants, writing story source, or adding background preview executions.
- Mutating canonical variant state from detection or matrix cells.

## Detection contract

### Eligible domains

Reuse `isHistoireMatrixPropName` and `getHistoireMatrixValues`; do not duplicate name/scalar normalization utilities.

1. Visit `_hPropDefs` in existing component traversal order, then each component's declared prop order. Record the first owner of every valid name, even if that first declaration is not eligible. Later duplicate declarations cannot advertise values for a different destination; runtime overrides resolve the first owner too.
2. A bounded runtime `values` array supplies its ordered scalar domain. Only finite JSON scalars are supported: `string | number | boolean | null`. Preserve typed identity (`1` differs from `'1'`) and deduplicate with the shared helper. Treat domains larger than the existing 64-value wire bound or containing non-scalar/non-finite members as unusable automatic metadata rather than silently inventing a smaller domain.
3. A declaration whose supported runtime type set is exactly Boolean supplies `[false, true]`. A Boolean mixed with open string/number/object/array/unknown types is not a proven finite domain without explicit values.
4. If no declaration owns a valid top-level state name, an own Boolean field in current cleaned variant state supplies `[false, true]`. This is the cross-framework fallback. Arrays, internal `_h*` fields, nested objects, functions, strings, numbers, and null alone do not supply domains. Do not add candidate values from current `prop.value` or default alone.
5. Apply `story.matrix.axes` last. A valid hint overrides the automatic domain for that exact name and can add axes absent from runtime definitions. Retain existing protocol limits of 32 axis names and 64 values per axis.
6. At least two distinct values make an axis usable for the matrix. Singleton finite domains can remain useful metadata for a base-prop editor, but must not make an otherwise unusable story appear matrix-capable. Gate availability/default selection against usable domains, not raw candidate count.

Prefer extending `discoverMatrixAxes(definitions, hint?, state?)` with an optional state argument, keeping existing direct callers compatible. If a small helper is needed for strict domain validation, keep it beside existing discovery logic and reuse shared scalar normalization; do not change the public protocol normalizer's existing sanitization behavior merely to implement this local requirement.

### Deterministic defaults and precedence

- Valid explicit URL `rows` and `cols` win independently. An invalid row must not discard a valid column.
- Then retain valid saved/user axis choices for the same story.
- For missing dimensions, prefer usable names explicitly declared by story hints, in hint declaration order.
- Then prefer smaller usable finite domains, stable by declaration/discovery order on equal sizes. Two Booleans therefore produce four initial cells rather than choosing a large enum merely because it appeared first.
- Never select the same name for both dimensions.
- Domain changes reconcile persisted value filters against currently advertised typed values. Keep an explicitly empty filter empty; do not turn it back into “all”. Base edits cannot shadow axes or internal names.
- Do not persist blank fallback axes while metadata is still pending/unowned. A temporary runtime reload must not erase saved choices or base edits.
- Automatic detection enables the existing Matrix action; it does not automatically switch the user's arrangement from Grid/List to Matrix.

Implement the default-pair resolver as a pure helper, with JSDoc, near discovery or in a small adjacent module. Accept explicit hint names as input rather than adding UI-only provenance to the protocol type.

## Runtime observation and source ownership

### Shared generation helper

Extract the existing generation computation from `components/canvas/frame-state.ts` into `components/canvas/frame-source.ts`, e.g.:

```ts
/** Current executable generation for an exact existing variant target. */
export function getCanvasTargetGeneration(
  snapshot: HistoireReadonly<HistoireSnapshot>,
  target: HistoireTarget,
): string | undefined
```

Preserve current conditions: source session ready, not stale, source exists, story and variant exist. Generation is `[source.url, source.sourceId, source.epoch, story.runtimeRevision ?? source.revision]`. Frame-state cache and matrix observation use this same helper. An unrelated catalog publication with unchanged `runtimeRevision` does not discard valid metadata; a changed executable revision, epoch, URL, removed story/variant, stale/disconnected session does.

### Canonical observation

Update `createMatrixStore.synchronize` to accept the full readonly snapshot contract needed for ownership checks rather than its current three-field pick.

A canonical state supplies candidates/base defaults only when:

- session/source are current;
- runtime is ready with non-null runtime ID;
- state runtime ID equals current runtime ID;
- state target matches exact canonical selection, including variant ID;
- selected variant belongs to the current story/generation.

A retained state object must not be reclassified as fresh metadata merely because source generation changed. Drop its previous-generation projection and wait for a fresh current-state publication/runtime. Snapshot watchers must include runtime readiness/identity, source status/staleness and source changes as well as selection/state/catalog/query changes.

Explicit hints can still enable Matrix before current runtime metadata exists. Do not seed base defaults from an unowned old state.

### Chooser observation from existing passive previews

Add a narrow provider-owned observation port to the matrix store, or a small adjacent backing module if needed to keep store below 300 lines. Suggested contract:

```ts
/** Narrow port for existing preview metadata ownership. */
interface MatrixRuntimeObserverPort {
  /** Register one existing ordinary preview's observational metadata lifetime. */
  registerRuntimeObserver: () => {
    /** Publish cleaned snapshot only while this observer still owns its lifetime. */
    capture: (snapshot: HistoireReadonly<HistoireSnapshot>) => void
    /** Retire callback ownership; valid finite projection may remain generation-scoped. */
    close: () => void
  }
}
```

`CanvasReplicaPreview.vue` registers this only for ordinary Grid/List replicas (`!props.propsOverride`). Capture real replica snapshots already received by its subscription. Capture initial snapshot after ready if necessary; SDK may publish state after its ready event. The observer must reject stale/disconnected/unready snapshots and require snapshot selection/state/runtime IDs to agree.

Store only detached projected finite metadata and base fields for exact target/generation, not a live session, callbacks, DOM nodes, or full mutable runtime state. Copy finite arrays so a caller cannot mutate the retained projection. Keep retained observations scoped to current story and invalidate by the shared generation helper; do not build an unbounded cross-book history.

Chooser (`variantId: null`) uses the story's first collected variant as matrix base, matching `MatrixView.vue`. It may read an existing current-generation projection for that exact first target. It must not choose whichever passive frame happened to respond first. If first variant is not admitted/ready, remain pending/unavailable until ordinary budget behavior admits it; detection does not increase budget.

Direct entry or reload with `variantId&arrange=matrix` must first render the ordinary Grid while proven axes are unavailable, retaining Matrix URL/toolbar intent. Its existing first preview supplies metadata; switch rendered canvas to Matrix when usable axes arrive. Do not create a separate discovery iframe, mutate canonical selection, rewrite arrangement intent, or treat deliberately empty value filters as missing metadata. Browser acceptance must reload this exact no-hint chooser route and observe four real cells without choosing a variant or clicking Grid.

When a real variant is selected, prefer fresh exact canonical metadata. A passive first-variant projection must not populate a different selected preset's base defaults. A retained exact-target projection may cover the transition while that same target's canonical runtime is mounting, provided generation is current; canonical fresh state replaces it when available.

Retire observers on retry/replacement/unmount before stale callbacks can run. Keep a valid finite projection after Grid unmounts when entering Matrix, so chooser axes do not disappear just because Matrix replaces its discovery preview. Retained projections carry generation ownership and cannot update canonical state. Matrix cell sessions never register observations, preventing their override values from feeding discovery.

## Matrix runtime fixes required by this feature

### Exact base preset registration

Re-register `MatrixCell.vue` registry target when `frame.id`, story ID, or base `variantId` changes. Release only the registration owned by that component. Preserve current child iframe/session attachment when geometry alone changes. Base preset change retires old source readiness immediately and waits for replacement child readiness; do not leave “Save as variant” attached to old preset.

Existing `CanvasReplicaPreview` key by base variant is useful; registry metadata must follow it. Selected cell identity may stay local, but measure/picker/context/screenshot/source actions must observe the new exact target.

### Bounded override request IDs

Replace `canvas-props:${frameId}:${counter}` with a short per-replica opaque request identity plus monotonically increasing request counter. Cell values/story IDs may be long, and request IDs must fit the shared wire bound independently of them. Keep current exact source window/origin/document/request checks and pending override cancellation. Do not hash/truncate the cell key or change its collision-free local identity.

## Files and implementation order

1. Extend behavior tests first:
   - `packages/histoire-vue/src/__tests__/workbench-matrix.spec.ts`; split new discovery/ownership tests into `workbench-matrix-detection.spec.ts` if keeping the existing file small requires it.
   - `packages/histoire/src/node/__tests__/variant-auto-props.spec.ts` only for metadata projection behavior actually changed/relied on.
   - Existing replica/frame helpers tests: use current project fixtures rather than duplicate session/deferred stubs. Add a focused mount/probe test for base registration/request identity if needed.
2. Implement pure discovery/default-pair helpers in `packages/histoire-app/src/app/util/matrix.ts` or adjacent `matrix-detection.ts`.
3. Extract shared generation helper and update `components/canvas/frame-state.ts` imports, keeping existing behavior unchanged.
4. Add guarded observation and retained finite projection to `stores/matrix.ts` or small `stores/matrix-runtime.ts`; update synchronization/choice normalization.
5. Wire ordinary replica observation and short request IDs in `components/canvas/CanvasReplicaPreview.vue`.
6. Fix `components/canvas/matrix/MatrixCell.vue` exact preset target/source registration.
7. Update `standalone/workbench.ts` synchronization dependencies and any duplicate `MatrixView.vue` watch. Keep toolbar, matrix bar, and inspector using the same provider-owned model. Explanatory empty state stays concise; no new marketing/filler panels.
8. Remove explicit Boolean `:matrix` hints from `examples/vue3/src/components/WorkbenchMatrix.story.vue`.
9. Extend `examples/vue3/cypress/e2e/ui-workbench.cy.js` to prove no-hint chooser discovery, all four rendered Boolean combinations, preset target correctness, and canonical state isolation. Use existing helper selectors.
10. Update `docs/guide/ui-matrix.md` with automatic sources, chooser behavior, explicit hint precedence, finite-domain limits, and TypeScript union limitation. Do not advertise unsupported inference.

## Required behavior tests

Tests must prove data/lifetime behavior, not style/class snapshots.

- Two Vue Boolean declarations work without a hint; mixed Boolean/open-string declaration does not claim a finite domain.
- Runtime finite string/number/null/Boolean domains retain typed distinct values. Open strings/numbers and scalar examples/defaults do not become axes. Empty/invalid/oversized domains cannot enable Matrix.
- First component owner wins even when its prop is non-finite and a later same-name component is Boolean. Root Boolean fallback cannot replace a declared non-finite owner.
- Plain cleaned state with two own Booleans enables four combinations with no `_hPropDefs`; nested/internal fields and array-root state do not.
- Explicit hint overrides detected Boolean/enum values and supplies additional finite axes.
- URL choices win, valid saved choices survive reload, hint names beat automatic fallback defaults, smaller domains win automatic fallback, and tie order is stable.
- Zero/one usable axis remain unavailable; singleton domains do not inflate availability. Pending runtime publication does not overwrite saved dimensions. Removed values reconcile filters without resetting explicit emptiness.
- Old target/runtime/source epoch/executable revision observations do not populate current candidates/base defaults. Fresh exact canonical snapshot wins over passive projection. Unrelated catalog revision with unchanged executable revision preserves projection.
- Chooser first-variant observation enables Matrix without selecting a frame; an alternate-variant observation cannot supply first-variant defaults. Entering Matrix after passive unmount retains current-generation projected metadata. Closed observer cannot replace newer data; matrix cells never contribute observations.
- Base preset switch updates registry target and blocks old source completion. Long scalar axis values produce bounded request IDs and successful override/correlation, preserving distinct cell keys.
- Existing Cartesian expansion, filters, copy generation checks, canonical isolation, and frame budget tests keep passing.

## Browser acceptance owned by root

Run against rebuilt normal dev and static Vue books, in light and dark themes:

1. Fresh chooser URL for `Workbench matrix`, no hints and no `variantId`: wait for ordinary passive first frame, verify Matrix becomes enabled, canonical URL/selection stays chooser, then choose Matrix.
2. Verify four live Boolean combinations display `enabled`/`emphasized` values, with unchanged canonical controls/state.
3. Choose alternate base preset and verify every live cell displays `Alternate preset`; selected cell actions/source use alternate exact variant.
4. Verify axis swap/filter/base editing and restored axes still work; changing a free-text base value does not invent an axis.
5. Exercise a long finite advertised value with another Boolean axis and verify cells receive overrides without timeout/wire rejection.
6. HMR removal/change of a finite domain removes stale candidate/defaults; old physical document cannot repopulate them. Static book performs same runtime discovery without dev-only services.
7. Many-cell matrix still obeys configured live budget including canonical reserved slot; no extra detection preview mounts.

Svelte/React root-state Boolean detection can be proven by focused factory/runtime tests. Only claim browser cross-framework acceptance if corresponding real example book was run.

## Validation and handoff

Implementation agent runs focused source-level tests and lint, then reports exact files and results. Root owns all builds and full `vue-tsc`; do not compete with the typecheck agent or rebuild artifacts underneath another test runner.

Relevant commands after root releases the build lane:

```bash
pnpm --filter @histoire/vue exec vitest run src/__tests__/workbench-matrix.spec.ts src/__tests__/workbench-matrix-detection.spec.ts
pnpm --filter histoire exec vitest run src/node/__tests__/variant-auto-props.spec.ts src/node/__tests__/preview-matrix-isolation.spec.ts
pnpm exec eslint packages/histoire-app/src/app/util/matrix*.ts packages/histoire-app/src/app/stores/matrix*.ts packages/histoire-app/src/app/components/canvas/frame-source.ts packages/histoire-app/src/app/components/canvas/frame-state.ts packages/histoire-app/src/app/components/canvas/CanvasReplicaPreview.vue packages/histoire-app/src/app/components/canvas/matrix/MatrixCell.vue
```

Adjust named test files to those actually created; preserve existing runtime prefix required by this checkout. Full app/embed/workbench typechecking and package builds belong in root's final integration pass.

Acceptance requires meaningful automatic behavior in the no-hint fixture, no stale-owner projection, exact base preset registration, bounded request IDs, existing matrix/frame-budget behavior passing, and documentation matching actual inference. A TypeScript union remains an explicit-hint case until an authoritative finite metadata producer exists.
