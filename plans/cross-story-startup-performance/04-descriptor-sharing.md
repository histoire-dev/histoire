# Slice 4: share accepted immutable source metadata safely

## Ownership

Own narrow SDK internal descriptor projection/accessors, related source connection validation seam, `canvas/frame-replica.ts`, standalone session metadata wiring and associated SDK/backend tests. Coordinate with scheduler agent: it owns `CanvasReplicaPreview.vue`, you own frame-replica metadata. Preserve public detached `getHistoireSessionDescriptor` semantics and public SDK APIs.

## Current repeated work

Each canvas replica calls getHistoireSessionDescriptor (full clone), embed source validates/clones, SDK controller validates/clones again, then snapshot copies catalog. Codegen amplifies full catalog traversal across 11 sessions. Validation must stay at external input boundaries; never add a caller-controlled trusted boolean or cache arbitrary mutable objects as valid.

## Implementation

1. Write regressions covering mutation isolation and invalid source rejection before changing production.
2. Identify accepted descriptor lifetime in canonical SDK session (epoch/revision and exact replacement identity). Create a private immutable accepted projection once per accepted source generation if sharing is safe. Recursively freeze/defensively copy once, including nested catalog/config/assets/capabilities. Weak ownership tied to canonical accepted descriptor prevents unbounded global retention.
3. Expose only a narrow first-party internal mechanism for canvas replicas to use that exact accepted projection. Use opaque branding/identity rather than public trust flag; choose existing protocol/SDK boundary that avoids cycles and duplicate utility implementations. Public detached descriptor getter remains detached; public adapters/external descriptors must continue full validation.
4. Source connections and SDK admission recognize only this internally minted immutable object and skip duplicate validation/copy where safe. If returning shared snapshot metadata would change existing mutation contract, keep snapshot copying; optimize safe validation/cloning portion instead. Report measured remaining cost rather than weakening isolation.
5. Source notifications mint new accepted projections; stale/invalid publications still rejected before any observer sees them. Settings/state/events/selection remain per session. One replica disposing cannot invalidate another's accepted metadata. Changes in actual source object even with same advertised revision cannot get stale cache hits.
6. Reuse shared canonical generation projection across all simultaneous replica initializations and notifications, but no runtime/session pooling. No public protocol/config changes.

## Tests and proof

Validate external malformed descriptors, mutable public inputs after validation, detached getter mutation, nested metadata isolation, parallel replicas, independent settings/state, source replacement/invalidation and invalid notification handling. Assert expensive validation happens once for private accepted projection while ordinary public admission still validates. Keep cache bounded by object lifetime. Run SDK/session and standalone/embed source integration tests. Parent typechecks SDK/protocol/app and builds before real browser measurements.

## Results

SDK now validates, detaches, recursively freezes, and privately brands each accepted descriptor. Controllers reuse only same-copy branded values; unbranded connection descriptors and notifications still pass full protocol validation. The brand is a `WeakSet` identity, so replacement objects—even with the same revision—cannot inherit acceptance. Catalog/config/assets metadata is shared, while capabilities, catalog snapshots, settings, state, events, and selections remain session-owned copies.

The internal accepted-descriptor accessor returns the exact canonical object and is forwarded by standalone selection and explorer facades. The public getter still returns a detached mutable clone. Canvas replicas pass the accepted projection through standalone source loading and react to status or source-publication identity changes; catalog publications replace the immutable snapshot source object even at the same advertised revision, while unrelated settings/state updates do not trigger fallback clones. Embed admission keeps descriptor-version and portable-field checks on branded values; external values still receive full validation and cloning. Same-revision embed publication suppression and external origin/access checks remain unchanged. If separate SDK module copies do not recognize a brand, the accessor falls back to detached metadata, preserving full-validation behavior without caching arbitrary objects.

Regression coverage verifies immutable shared identity, detached getter semantics, adapter-input mutation isolation and rejection, same-revision replacement, multi-copy fallback, required embed fields, facade forwarding, replica sharing, per-session settings isolation, and no descriptor reads for unrelated canonical snapshots. Focused results: SDK internal 10/10; embed source adapter 4/4; standalone navigation and canvas replica 7/7; local source revision 9/9. Exact commands:

```sh
pnpm --filter @histoire/sdk test src/__tests__/internal.spec.ts
pnpm --filter histoire test src/node/__tests__/embed/source-adapter.spec.ts
pnpm --filter histoire test src/node/__tests__/canvas-replica-url.spec.ts src/node/__tests__/ui-standalone-navigation.spec.ts
pnpm --filter histoire test src/node/__tests__/embed/local-source-revision.spec.ts
```

No builds or browser measurements run here; parent owns those checks.
