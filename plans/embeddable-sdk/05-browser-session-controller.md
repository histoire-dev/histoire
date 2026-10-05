# 05 — Browser session controller

## Outcome and prerequisites

Depends on: 01.

Implement framework-neutral session behavior against injected first-party adapters. No app/Vue/Node dependency or DOM access at construction. [public-api.md](public-api.md) owns methods, selection, state, event bounds, and lifecycle rules.

## Owned files

- Add packages/histoire-sdk/src/session/{controller,snapshot,selection,state,settings,events,ownership}.ts.
- Add src/adapters/types.ts and src/internal.ts injection seam; use protocol serialization/identity helpers from slice 01.
- Add src/persistence/{storage,key}.ts with lazy browser storage access.
- Add SDK session/selection/state/ownership tests using one shared fake transport and controlled-clock fixture.
- Existing app Pinia adapters migrate in slices 08/14; no duplicate global frame store introduced here.

## Tests first

1. Construct/import session without window/document; subscribe/unsubscribe and snapshots work without source execution.
2. Connect two fake sources with identical IDs; selection, settings, pending operations, and events remain session-local.
3. Cover remembered choice, first variant, explicit null, docs-only story, removed variant, and invalid explicit IDs preserving prior selection.
4. Send runtime-first state then patch echoes. Preserve runtime baseline and omitted callbacks; explicit user edits during reload cannot be overwritten by empty host state.
5. Attempt runtime operations without primary, unsupported operations, second primary claim, and disposal during connect/request. Assert exact typed errors and observed late completion.
6. Retain 1,000 events, increment droppedCount, clear/unsubscribe, and isolate two persistence keys/sources. Simulate storage denial with memory fallback.

## Implementation steps

1. Construct immutable controller snapshot and per-session adapter/resource registries. Build observable services over that controller rather than one global store.
2. Implement connect state machine; reuse pending connection promise, reject terminal disposed access, and keep disconnected session explicit. Real remote transport arrives in slice 07.
3. Publish coherent completed source/selection/runtime snapshots. Subscribers get disposer; callback exceptions cannot prevent other listeners or transport cleanup.
4. Validate target against catalog before mutation. Selection without runtime updates metadata only; selection with runtime captures new document and awaits readiness. Preserve explicit-null standalone seam.
5. Reserve primary slot synchronously before attachment. Teardown marks inactive first; ownership released only after resource cleanup. Expose this seam to iframe/native runtime adapters.
6. Keep host state a serializable mirror. Require matching selected ready runtime for state operations and dynamic features; correlate acknowledgment before resolving patch/reset.
7. Apply protocol reconciliation once; runtime adapter unwraps refs. Protect derived prop definitions and preserve automatic prop override fields.
8. Queue only explicitly captured user patches while selected runtime reloads. Never replay stale full mirror or test operations. Superseded target edits reject rather than drift to new target.
9. Store validated settings even without primary and apply once runtime is ready. Bound events and preserve attributable structured identities.
10. Persistence reads/writes occur only when caller opted in and browser storage exists. Namespace normalized source URL plus caller key; avoid global standalone preference keys.
11. Maintain owned pending operations with epoch/connection/mount/runtime/target capture. Mark inactive and reject before asynchronous dispose; attach observation to abandoned promises and release listeners/timers.

## API changes

Implement browser controller methods defined in [public-api.md](public-api.md). First-party adapters use @histoire/sdk/internal; unsupported external loaders remain outside public API. Availability derives from negotiated source capability plus runtime readiness.

## Failure paths

No source connection, unsupported capability, invalid target, missing runtime, stale revision/document, disconnect, and disposal fail distinctly. Observer/storage failure cannot crash session or trigger retry. No runtime created to satisfy data/state/test request automatically.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/sdk test
pnpm run lint
~~~

Controller gate uses deterministic injected adapters. Real DOM/remote readiness evidence is intentionally deferred to slices 07/08.

## Acceptance criteria

- Independent sessions, structured targets, coherent snapshots, bounded events, disposal, and opt-in persistence verified.
- Runtime requirements/capabilities enforce explicit ownership.
- State reconciliation retains canonical runtime semantics and suppresses echoes/stale completion.
- SDK imports/constructs without DOM/framework/platform dependencies.

## Non-goals

Iframe handshake, source virtual modules, UI components, native CSS, hidden preview placement, and public custom transport API.

## Handoff

Provide adapter callbacks/resource ownership seam, controlled transport fixture, selection/readiness semantics, and snapshot shape to slices 06–09. Explicitly identify which methods currently require injected adapters and remain unavailable against real URL until source/transport work lands.
