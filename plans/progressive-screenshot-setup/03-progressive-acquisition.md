# 03 — Progressive browser acquisition

Prerequisite: [02](02-discovery-and-contracts.md).

## User outcome

One capture tries existing setups in fixed order and uses the first candidate that passes startup. No candidate works: return classified setup failure and smallest relevant repair. A broken story never causes renderer roulette.

## Owned files

New `packages/histoire/src/node/runtime/browser/setup/{probe,acquire,report,owner}.ts`; extend setup types/policy. Existing `runtime/browser/{dependencies,session,errors,limits}.ts`; reuse `runtime/cleanup.ts`, `util/playwright-cleanup.ts`. New `__tests__/browser-setup-acquisition.spec.ts`; extend existing `__tests__/mcp/screenshot.spec.ts` and shared preview-browser/deferred fixtures.

## Tests first

- Matching shell succeeds: no full/Chrome/Edge launches.
- Missing shell and absent full, installed Chrome succeeds: no download; exact channel chosen; one browser handed to story session.
- First acquired browser fails neutral context/probe: confirmed context/browser close before next candidate starts.
- Branded Chrome fails with known setup reason, Edge succeeds: ordered attempts retained, earlier failure does not poison success.
- Explicit source fails: zero fallback attempts.
- Unknown startup error, candidate timeout, external cancellation, or retired generation: chain stops; no heavier-install claim inferred.
- Probe finishes after cancellation: late browser is released; no `ready` publication.
- Cleanup hangs/rejects: queue is quarantined through existing unconfirmed-cleanup handling; next candidate and next capture never start.
- First successful selection retained within owner; refresh invalidates it. When cached choice later has a classified startup failure, invalidate and retry remaining ordered candidates once, never duplicate attempts.
- Story runtime error/readiness timeout/props rejection occurs after neutral probe: no candidate fallback; preserve existing capture failure.

## Implementation sequence

1. Introduce owner state with captured generation `isActive()` and immutable snapshot revisions. No module-level mutable owner/cache. `close` marks terminal synchronously and is idempotent.
2. Keep injected `launch` path behavior unchanged: one owned launch, current cleanup, no real discovery. Production path obtains `CaptureBrowserLease` from setup owner.
3. Compute absolute acquisition deadline from existing session budget. At most four auto candidates, three seconds per candidate, no new budget per retry. Neutral probing consumes this same budget. Explicit setup check receives 15-second absolute deadline.
4. Attempt unknown shell using normal `chromium.launch({ headless: true, timeout })`. Full Chromium uses `channel: 'chromium'`; branded channels are fixed. Custom executable receives only trusted normalized path, never caller script/args.
5. For first unverified candidate, create neutral context at 320×240, one `about:blank` page, and tiny PNG screenshot; validate PNG dimensions through existing parser. Close neutral context before handing selected browser to story session. No story host or target source is loaded during probe.
6. On success, snapshot source and clear repair list. Reuse that same browser for capture, preventing redundant cold launch. Store candidate choice/probe receipt; subsequent fresh launches may omit redundant neutral probe while selection/driver/generation remains valid.
7. Session retains fresh per-capture context and all deterministic options/readiness checks. Session release calls lease release, which confirms browser teardown in this slice. Preserve injected launch's whole-browser cleanup separately with common helper.
8. Classify launch failure narrowly in one report module. Maintain a small audited list of tested Playwright failures, not broad substring catch-alls. Missing executable before spawn is safe fallback. For failures after spawn, require known driver failure cleanup semantics or acquired owned handle cleanup; unknown termination must stop the chain.
9. Neutral screenshot/probe failure is a candidate setup failure only when diagnosed as missing/unsupported browser functionality. Unknown probe errors stop; artifact size or story screenshot errors after selection are ordinary capture errors.
10. On cancellation/error, close any browser acquired late. Never release lane or publish success while owned cleanup is pending. Use existing deadline/quarantine helpers, not a private promise race that abandons acquisition.

## Repair behavior

No driver suggests driver install only. No browser suggests selected-driver CLI shell install. Known missing system libraries suggest Linux system-dependency repair. Explicit full renderer selected suggests full install if absent. Unknown failures suggest check/diagnostic path, not full download. Public error preserves existing code; bounded optional setup payload carries reason/repairs for UI.

## Acceptance

Behavior tests prove stop-at-success, finite attempts, late resource cleanup, exact source, no installation, and no story fallback. Existing screenshot cancellation/dimension/determinism tests still pass. Source modules remain small; inspect/refactor session responsibilities if it approaches 300 lines.

## Handoff

Record failure classifier examples, budget policy, cleanup evidence, and candidate cache key. Live adapters land in 04; do not claim all entrypoints support progression yet.
