# 02 — Configuration, driver discovery, and setup contracts

Prerequisite: [01](01-headless-only-guidance.md). No browser launch in this slice.

## User outcome

Runtime can describe available setup candidates and trusted explicit choice without requiring installations or starting browsers. This is infrastructure, not full progressive capture enablement.

## Owned files

New:

- `packages/histoire-shared/src/types/config-browser.ts`
- `packages/histoire-shared/src/types/screenshot-setup.ts`
- `packages/histoire/src/node/config/browser.ts`
- `packages/histoire/src/node/runtime/browser/setup/types.ts`
- `packages/histoire/src/node/runtime/browser/setup/policy.ts`
- `packages/histoire/src/node/runtime/browser/setup/driver.ts`
- `packages/histoire/src/node/runtime/browser/setup/candidates.ts`
- `packages/histoire/src/node/runtime/browser/setup/locations.ts`
- `packages/histoire/src/node/__tests__/browser-setup-discovery.spec.ts`
- `packages/histoire/src/node/__tests__/config-browser.spec.ts`

Existing: shared `types/config.ts` and export barrel; config `process.ts`, `defaults.ts`; `virtual/resolved-config.ts`; existing `__tests__/ui-public-config.spec.ts`; `runtime/browser/dependencies.ts`; `packages/histoire/package.json` for optional `playwright-core` peer metadata. Reuse dependency resolution/import helpers unchanged unless an actual missing seam is proved.

## Contracts to implement first

Use [contracts](contracts.md) as authoritative. Export shared config/portable setup types. Define one immutable normalized policy and private driver/candidate types. Each candidate has source, launch options, and presence `present | absent | unknown`. Driver identity holds resolved real module path and version privately.

Internal setup owner signature:

```ts
/** Generation-scoped setup state and owned acquisition. */
interface ScreenshotSetupOwner {
  /** Metadata discovery only; never launches. */
  discover: () => Promise<ScreenshotSetupSnapshot>
  /** Acquires proven browser under caller's signal and absolute deadline. */
  acquire: (signal: AbortSignal, deadline: number) => Promise<CaptureBrowserLease>
  /** Clears dependency absence, candidates and probe receipt; preserves policy. */
  invalidate: () => void
  /** Detached immutable current observation. */
  getSnapshot: () => ScreenshotSetupSnapshot
  /** Subscribe to current owner's observations; returns disposer. */
  subscribe: (listener: (value: ScreenshotSetupSnapshot) => void) => () => void
  /** Terminal owner shutdown; awaits owned cleanup. */
  close: () => Promise<void>
}
```

Declare interface here; implement acquisition/owner state in 03. Setup checks are ordinary lane tasks using `acquire`/`release`, not a second internal queue or separate browser API.

## Useful tests first

1. Project `playwright` wins over project core and Histoire-local packages; project core wins over fallback playwright.
2. Missing optional packages returns `driver-missing`; import failure/API mismatch of preferred resolved package returns `driver-invalid` without changing package silently.
3. Discovery calls no browser launch and no installer/process/network/Vite startup.
4. Shell presence remains unknown without private APIs; full executable absent plus branded Chrome present yields ordered shell-unknown then Chrome candidate.
5. Isolated configured browser cache is respected through selected driver's public resolution. No stale revision scan or foreign package cache chosen.
6. Linux/macOS/Windows branded known-location cases produce finite candidates. Missing installation skips branded candidate, not global filesystem search.
7. Explicit source yields exactly one candidate; executable path with spaces remains one path, relative path uses project root.
8. Pre-1.49 drivers use public default Chromium first in auto mode, omit proven-absent Chromium before branded channels, and report explicit shell as `driver-version`.
9. New trusted `browser` config, especially executable path, never appears in dev or static public virtual config. Existing unrelated public settings remain present.
10. Driver package version is read from the selected real module's package boundary, including when project and Histoire fallback packages both exist.

Extend existing dependency/browser fixtures for controlled imports/filesystem checks; no duplicated fake Playwright driver per test file.
Owner isolation, refresh, replacement, and restart behavior belong to slice 03 and are not tested before its owner exists.

## Implementation steps

1. Add shared types/config normalizer with JSDoc and strict validation. Omitted policy is auto; custom executable exists check deferred to setup. In the same change, destructure `browser` out of `virtual/resolved-config.ts` public config in both dev and build modes. Existing virtual module serializes remaining config broadly, so deferring this exclusion would leak executable paths.
2. Preserve project-first package resolution using explicit `fallback: false` passes before Histoire-local fallback. Resolve/import no story/Vitest provider modules.
3. Add optional core peer metadata; retain optional playwright and dev testing prerequisites. Type imports can remain from playwright because they erase at runtime; packed consumers must prove core-only runtime behavior later.
4. Implement candidate inventory using public APIs. `chromium.executablePath()` takes no arguments; do not infer shell path from full path, registry JSON, package internals, or cache directory names.
5. Version-gate separate headless shell and full Chromium `channel: 'chromium'` to Playwright >=1.49.0. Older drivers use their regular public bundled Chromium executable as the default headless auto candidate, then branded channels; explicit `headless-shell` returns `driver-version`. Do not raise global playwright peer minimum solely to enable optional full renderer. Record minimum tested version in receipt.
6. Fix `ScreenshotSetupOwner` and `CaptureBrowserLease` interfaces in `runtime/browser/setup/types.ts`; implement owner observations, attempts, and terminal cleanup in slice 03.
7. Keep `browser` outside existing config-codemod client writable/readable allowlists. UI setup consumes only scrubbed setup DTO, not private config.

## Acceptance

Config/exports compile; config and discovery tests pass. Candidate discovery never launches or installs, explicit policy is preserved, and private executable paths stay out of dev/static client config. Owner lifecycle tests and live capture fallback belong to slice 03; do not advertise M1.

## Handoff

Record exact shared and internal types, resolver functions, supported driver-version behavior, public API limits, and exact stable-channel locations. Slice 03 consumes this inventory without recreating resolution rules.
