# Validation and handoff

## General gates

- Test behavior through existing task/session/service entrypoints. Do not assert CSS classes, source text, private method calls, or whole error stderr snapshots.
- Reuse `packages/histoire/src/node/__tests__/utils/mcp/preview-browser.ts`, `deferred.ts`, `preview-png.ts`, and existing capture/project/CLI fixtures. Add only missing behavior to shared fixtures.
- Write useful failing tests first when a slice changes behavior. Guidance-only slice 01 does not need mirrored string tests.
- Every failed-candidate test proves the next candidate cannot start until previous cleanup settles. Every terminal-failure test proves no further launch occurs.
- Tests that mock driver/browser APIs prove ownership and selection, not real screenshot fidelity or operating-system support.
- Run focused tests and affected builds/types. Record unrelated baseline failures separately; do not run whole monorepo repeatedly after focused gates pass without new reason.
- Plan pack changes do not require runtime tests. Validate local Markdown links, code fences, slice prerequisites, existing file references, and whitespace.

## Suggested focused commands for implementation

```sh
pnpm --filter histoire test -- src/node/__tests__/browser-setup-discovery.spec.ts
pnpm --filter histoire test -- src/node/__tests__/browser-setup-acquisition.spec.ts
pnpm --filter histoire test -- src/node/__tests__/mcp/screenshot.spec.ts
pnpm --filter histoire test -- src/node/__tests__/ui-screenshot.spec.ts src/node/__tests__/ui-screenshot-channel.spec.ts
pnpm --filter histoire test -- src/node/__tests__/mcp/capabilities.spec.ts
pnpm --filter histoire build
pnpm --filter @histoire/shared build
pnpm --filter @histoire/app build
pnpm --filter histoire test:mcp:integration
pnpm --filter histoire test:mcp:package
```

New test filenames are proposed. Verify package scripts/CLI argument forwarding before running. Select relevant existing integration cases rather than automatically launching every integration suite for each slice. If mise fails with read-only cache errors, use a verified installed Node binary and package-manager path; document the environment workaround, not as a feature failure.

## Acceptance matrix

| Environment | Expected outcome | Required proof |
| --- | --- | --- |
| No driver, installed Chrome | Install driver only; re-check then select Chrome | Packed consumer + CLI |
| Project `playwright`, matching shell | Shell selected, no branded launch/download | Real UI + SDK + MCP capture |
| Matching full Chromium only | Full cached renderer selected without download | Real capture with no shell |
| Project `playwright`, Chrome only | Stable Chrome selected; no pinned binary install | Real capture |
| Project `playwright-core`, Chrome only | Same isolated capture; dev Vitest stays unavailable | Strict package consumer |
| No compatible browser | Smallest shell install command shown | CLI + UI behavior, then fresh install receipt |
| Shell broken with classified setup failure, Chrome usable | Confirm teardown, then Chrome succeeds | Controlled browser fixture + real candidate selection |
| Unknown startup failure | Stop; diagnostic/check guidance, no guessed heavier install | Negative behavior test |
| Explicit Chrome missing, shell present | No fallback; explicit-choice failure | Unit + CLI |
| Installed browser but missing OS libraries | Targeted system-dependencies repair | Controlled supported Linux image |
| Permission failure | Targeted permission guidance; no blanket sandbox bypass | Fixture + documented real case if available |
| Story throws/times out/props rejected | Existing runtime failure; no renderer fallback | Real integration + launch count receipt |
| UI cancel while check/capture starts | Owned attempt cleaned; unrelated job unaffected | Deferred ownership tests |
| Generation changes during probe | Old result suppressed; successor owns fresh discovery | Runtime transition tests |
| Unconfirmed cleanup | Lane quarantined; no next candidate/capture | Existing cleanup fixture extension |
| Packed Node artifact on another machine | Target-machine discovery; no build path leakage | Deployment/consumer integration |
| Browser version unsupported | Controlled driver-version report | Versioned driver fixture + minimum-version smoke |

## Fidelity corpus

Extend existing capture determinism fixtures, not a second sample app. Include web font, inline SVG, opaque/transparent canvas backgrounds, scrollable content, shadow DOM if existing fixtures support it, matrix props override, and a CSS transition. Check intrinsic pixel dimensions/DPR, alpha, visible semantic marker or narrow pixel regions, and successful target readiness. Avoid whole-image golden baselines across system browser versions.

Verify PNG at 1×/2×/3× and WebP encoding; shell/full/Chrome source differences must not change viewport, props, selected variant, artifact limits, or transparency policy. Real browser-native capture remains the evidence path.

## Installation acceptance

Use temporary consumer directories and isolated `PLAYWRIGHT_BROWSERS_PATH` for fresh setup proofs. Do not uninstall or mutate user's shared browser cache to simulate absence. Install only in explicitly scoped acceptance environment; OS-library jobs belong to disposable containers/CI images, not user's workstation.

Record package version, browser source/version, OS, exact installation command, disk measurement if claimed, capture target/dimensions, and cleanup outcome. Do not attach secrets or absolute private paths to public UI/MCP receipts.

## Slice 08 measurements

Only after setup acceptance, compare cold first capture and repeated small captures/matrix batch with reuse off/on. Use bounded samples, record medians and process launch counts, and retain per-capture context isolation proof. Report idle memory and cleanup; a pooled browser improves launch count but can consume more idle RAM. No acceptance threshold invented before baseline measurement.

## Final handoff

Final receipt links exact changed files, chosen policies, focused tests, real consumer/OS evidence, and unresolved gates. Clearly distinguish implementation, unit proof, real browser proof, installation proof, and optional performance proof. No commit/push/release unless separately requested.
