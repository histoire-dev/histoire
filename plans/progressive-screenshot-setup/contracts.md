# Contracts and progressive selection

These are the target contracts for the progressive setup work. Slice 02 now implements the trusted config, portable types, driver discovery, and candidate inventory; acquisition and adapters remain in their later slices. Existing screenshot inputs/results and MCP tool names stay unchanged.

## Configuration

The shared config exports `HistoireBrowserSource` and `HistoireBrowserConfig` from `packages/histoire-shared/src/types/config-browser.ts`. `HistoireConfig.browser` is trusted Node-side configuration. Config processing defaults omission to `{ source: 'auto' }` and resolves relative executable paths against the project root. `createBrowserSetupPolicy(config, projectRoot)` in `runtime/browser/setup/policy.ts` returns a frozen `{ source, executablePath? }`; an executable path is absolute. The property is removed from public config in both dev and static output.

```ts
/** Browser policy for Histoire-owned isolated execution. */
export type HistoireBrowserConfig = {
  /** Prefer existing compatible installations; default is auto. */
  source?: 'auto' | 'headless-shell' | 'chromium' | 'chrome' | 'msedge'
} | {
  /** Use exactly the trusted local executable; no automatic fallback. */
  source: 'executable'
  /** Absolute path or project-root-relative path. Never a command string. */
  executablePath: string
}
```

Add optional `browser?: HistoireBrowserConfig` to `HistoireConfig`. Reject unknown fields, incompatible `executablePath` combinations, empty paths, URLs, and command strings. Paths with spaces are valid paths; use structured launch options, not shell splitting. Do not require executable existence during config parsing; missing configured files belong to setup reporting. Relative paths resolve against project root, never ambient cwd.

Explicit source is exclusive. For example, missing `chrome` produces its targeted setup failure; it does not select shell behind the user's back. Omitted config normalizes to `{ source: 'auto' }`.

Reuse settings in slice 08 are a later additive config extension; do not add dormant pool options in slices 01–07.

## Driver precedence

1. `playwright` resolvable from project, with `fallback: false`.
2. `playwright-core` resolvable from project, with `fallback: false`.
3. Existing Histoire dependency fallback for `playwright`, then `playwright-core`.

Resolve once per discovery revision, re-resolving after explicit refresh. Record real module path/version privately. Verify the selected module provides `chromium.launch`, expected executable resolution, and required browser APIs. Do not walk through arbitrary transitive package folders, invoke `npx`, or import globally installed packages.

`resolveBrowserSetupDriverIdentity(projectRoot)` in `runtime/browser/setup/driver.ts` resolves the selected real entry, reads its matching ancestor package manifest, validates the version as SemVer, and does not import package code. Node deployment can use this metadata to pin one optional driver without executing it. Runtime `resolveBrowserSetupDriver(projectRoot)` uses the same precedence, imports the selected resolved entry, and verifies `chromium.launch` and `chromium.executablePath`; it never launches a browser. A resolved but invalid preferred package returns `driver-invalid` without falling through.

Refresh clears negative package discovery as well as candidate/probe state, so installing a previously missing driver can enable the same running dev session. Reuse an already imported module only if real path/version remains unchanged. Replacing/upgrading an already imported driver at the same module path requires source restart; return `driver-version` with a concise restart action rather than pretending Node module-cache invalidation is safe. Package-manager writes remain outside the setup owner.

If a preferred resolved package cannot import or lacks required APIs, report `driver-invalid`; do not silently replace it with another package/version. This preserves project dependency ownership. Missing all drivers yields `driver-missing` before any browser attempt.

`playwright-core` support is limited to isolated execution. Existing development tests still require project `playwright`, `vitest`, and `@vitest/browser-playwright`.

## Auto candidate order

From Playwright 1.49.0 onward, use the separate headless shell first, then full bundled Chromium, then stable Chrome and Edge. The table shows that order. For older Playwright, no separate shell exists: the default headless launch uses the regular bundled Chromium executable, so auto starts with that public `executablePath()` as source `chromium`, then checks Chrome and Edge. It must not label the old default binary `headless-shell`.

| Priority | Candidate | Launch policy | Additional installation |
| --- | --- | --- | --- |
| 1 | Matching cached headless shell | `headless: true`, no channel | None |
| 2 | Matching cached full Chromium | `headless: true, channel: 'chromium'` | None |
| 3 | Installed stable Google Chrome | `headless: true, channel: 'chrome'` | None |
| 4 | Installed stable Microsoft Edge | `headless: true, channel: 'msedge'` | None |

Skip candidates proven absent through public APIs or known branded locations. Never download to populate this list. Shell/full Chromium must match the selected driver's expected revision. Branded candidates use finite platform locations and supported stable channels, not custom executable paths guessed from `$PATH`. Custom paths require explicit config.

Public `chromium.executablePath()` exposes the regular bundled executable and takes no channel argument in inspected Playwright 1.59.1. Do not invent a channel-aware variant or import private registry internals. For 1.49.0+, headless-shell discovery therefore retains an `unknown` presence candidate and lets ordinary headless launch resolve the matching shell. Missing shell is a classified acquisition failure, not a metadata launch. Check full Chromium via public `executablePath()` and branded candidates via known locations. On pre-1.49 drivers, use that same public executable path as the default headless Chromium candidate; no separate shell is available. Explicit `headless-shell` on such a driver reports `driver-version`, while explicit `chromium` continues to require the supported `channel: 'chromium'`. Internal candidate presence is `present | absent | unknown`; unknown is never reported as proven ready.

`discoverBrowserCandidates(policy, driver, options?)` in `runtime/browser/setup/candidates.ts` returns structured launch options and presence for the finite selection. It receives no story/session objects and calls no launch API. Optional platform, environment, and file-status arguments substitute only the filesystem/platform boundary for tests. `getKnownBrowserLocations(platform, env)` in `locations.ts` matches stable channel executable locations accepted by Playwright: Chrome/Edge application paths on macOS, the channel's `/opt` paths on Linux, and the channel paths under Playwright's Windows install roots. It does not include other PATH or package-manager locations that Playwright's channel resolver would not launch. Nonstandard locations require explicit `source: 'executable'`. There is no PATH lookup or cache scan. The `channel: 'chromium'` full Chromium candidate is offered only for Playwright 1.49.0 or newer; before that, auto uses the default bundled Chromium through `{ headless: true }` and the public executable path. An explicit full Chromium choice on an older driver is reported as `driver-version` without trying another source. `supportsSeparatedHeadlessShell(version)` exports the same 1.49.0 boundary for owner/reporting logic.

No Chrome beta/dev/canary auto-discovery. Candidate order is about using already available resources while preserving current renderer first, not ranking total binary sizes after installation.

## Setup snapshot

Define a small shared portable projection in new `packages/histoire-shared/src/types/screenshot-setup.ts`. Private module paths and stderr never enter it.

```ts
/** Finite renderer choice, safe for UI and diagnostics. */
export type ScreenshotBrowserSource =
  | 'headless-shell' | 'chromium' | 'chrome' | 'msedge' | 'executable'

/** Detached setup state; installed does not mean verified. */
export interface ScreenshotSetupSnapshot {
  /** Monotonic revision within the captured runtime generation. */
  revision: number
  /** Discovery, active probe, proven success, or required user action. */
  state: 'unverified' | 'checking' | 'ready' | 'needs-action'
  /** Selected browser after successful startup; absent otherwise. */
  source?: ScreenshotBrowserSource
  /** Fixed actionable category; absent for ready/checking. */
  reason?: ScreenshotSetupReason
  /** Bounded failed candidates in deterministic attempt order. */
  attempts: ScreenshotSetupAttempt[]
  /** Ordered fixed repairs, empty when ready. */
  repairs: ScreenshotSetupRepair[]
}
```

Define `ScreenshotSetupReason` as a finite union: `driver-missing`, `driver-invalid`, `browser-missing`, `driver-version`, `system-dependencies`, `permission`, `unsupported-platform`, `startup-failed`. Attempt rows contain source plus a reason, with maximum four rows. `checking` has no terminal repairs. Cancellation/timeouts remain operation errors; do not publish a durable `needs-action` conclusion merely because user cancelled.

Attempts may additionally include `stage: 'discovery' | 'launch' | 'probe'`, driver identity `{ packageName: 'playwright' | 'playwright-core', version: string }`, and one safe diagnostic: `process-exited` with optional unsigned 32-bit exit code and/or a finite known OS signal; `missing-library` with only a basename matching `lib*.so[.digits]`; or code-only `executable-format`, `sandbox-denied`, `invalid-probe-image`, `protocol-error`, or `unknown`. Driver versions are valid SemVer, at most 64 characters; library basenames are at most 128 characters. Do not include raw messages, executable/package paths, command lines, or extra diagnostic fields. All attempt fields are optional for compatibility with older snapshots. UI shows first attempt's driver identity once, then stage/diagnostic alongside each failed candidate; no top-level snapshot driver field is needed.

Repairs contain an allowlisted `id`, English `label`, and optional command specification `{ executable: string, args: string[] }`. Permit only the commands owned by slice 05. A serializer quotes display/copy strings safely. No client-authored commands, root paths, environment variables, arbitrary arguments, or browser downloads requested over UI events.

## Internal lease and state ownership

Use internal types, separate from portable DTOs:

```ts
/** Browser acquisition owned by one runtime operation. */
export interface CaptureBrowserLease {
  /** Browser tested before any story navigation. */
  browser: Browser
  /** Renderer selected under trusted policy. */
  source: ScreenshotBrowserSource
  /** Idempotent release; confirms cleanup or rejects. */
  release: () => Promise<void>
  /** Discards the exact process after uncertain context cleanup; pool owners may provide it. */
  discard?: () => Promise<void>
}

/** Generation-scoped metadata and acquired browser ownership. */
export interface ScreenshotSetupOwner {
  /** Metadata discovery only; never launches. */
  discover: () => Promise<ScreenshotSetupSnapshot>
  /** Acquires a proven browser under caller's signal and absolute deadline. */
  acquire: (signal: AbortSignal, deadline: number) => Promise<CaptureBrowserLease>
  /** Clears dependency absence, candidates, and probe receipt; preserves policy. */
  invalidate: () => void
  /** Detached immutable current observation. */
  getSnapshot: () => ScreenshotSetupSnapshot
  /** Subscribes to current owner observations and returns a disposer. */
  subscribe: (listener: (value: ScreenshotSetupSnapshot) => void) => () => void
  /** Terminal owner shutdown; awaits owned cleanup. */
  close: () => Promise<void>
}
```

Slice 02 fixes this interface in `runtime/browser/setup/types.ts`. Slice 03 adds `createScreenshotSetupOwner({ root, policy, isActive? })` and implements acquisition; candidate discovery alone does not create or cache an owner. Explicit check and refresh are adapter actions: check acquires and releases through the existing lane, while refresh invalidates before metadata discovery. Existing injected `launch` remains a supported single-candidate bypass; tests must not unexpectedly touch real dependency resolution.

A check uses the same execution lane as capture and releases its lease before completion. During capture, reuse the successful probe's browser for actual session opening, then close it normally. Cache positive candidate choice within an owner, not a process, and do not cache cancellation as negative availability.

## Stop rules

Continue only for classified setup failures before story navigation: absent executable, known missing system-library startup error, known unsupported launch feature/version, or candidate-specific permission failure. Clean up the entire attempted browser first. Unknown launch errors terminate with `startup-failed` and an explicit check/diagnostic instruction; do not advertise a heavier install as a guessed fix.

Terminal without candidate fallback:

- External cancellation or expired total deadline.
- Runtime/config generation retirement.
- Explicit browser choice failing.
- Unconfirmed neutral probe/context/browser cleanup.
- Story navigation, runtime exception, readiness timeout, rejected props, screenshot size mismatch, or artifact limit failure after selection.

Candidates have at most three seconds each within a single existing 30-second capture deadline. Explicit setup checks have a 15-second total deadline. Reserve remaining capture deadline for story readiness; no new independent 30-second budget per candidate. On a slow machine, a timed-out candidate stops the chain with a retryable timeout instead of triggering downloads.

## Repair progression

1. No valid driver: suggest installing `playwright`; then re-check existing browsers. Do not immediately demand browser download. `playwright-core` plus an existing supported browser is a documented opt-in alternative.
2. Valid driver, no usable browser: suggest `playwright install chromium --only-shell`; re-check.
3. Known missing OS dependencies: suggest `playwright install-deps chromium` for supported Linux environments, with note that system package privileges may be required. Do not add Firefox/WebKit/full Chrome.
4. Known permission problem: show targeted permission/environment guidance; never suggest blanket `--no-sandbox` or OS permission changes automatically.
5. A documented shell-specific incompatibility or explicitly requested full renderer: offer `playwright install chromium --no-shell` plus `browser: { source: 'chromium' }`. A download alone cannot change launcher selection.
6. Unsupported platform, corrupt driver, or unknown startup error: report diagnosed boundary and explicit check; no install escalation guessed from raw stderr.

Installing any step is user action outside capture execution. Stop progression immediately when re-check succeeds. Already installed shell is enough for normal screenshots; full Chromium is optional, not inevitable.

## Public surface compatibility

- Existing `histoire_capture_screenshot`, operation polling, artifacts, hashes, and SDK image results stay unchanged.
- Preserve existing MCP capability schema `{ available, reason? }`. `available` means a usable driver and a present or unknown candidate, subject to execution-lane health; it does not claim neutral probe success. This retains optimistic package-level admission while shell presence is unknown. After an exhausted explicit check, it can become false with a targeted reason. No launch during metadata reads. `reason` explains unverified/failed setup where useful.
- Add dev-only `histoire:ui:screenshot-setup` with `{ requestId, action: 'read' | 'check' | 'refresh' }`; `refresh` invalidates choice and performs discovery only.
- Add `histoire:ui:screenshot-setup-cancel` with `{ requestId }`; add correlated `histoire:ui:screenshot-setup-result` containing `{ requestId, setup }` or `{ requestId, error }`.
- Complete screenshot failure can have optional `setup` in its root `UiChannelError`, without changing code union. Partial-success result gains optional top-level `setup`. Per-target `errors[].error` always omits setup; never repeat setup DTO per row. At most one setup projection per complete event, chosen from the first setup-classified failure in target order.
- All events remain within 64 KB; cap setup projection at 8 KB. Reserve 8 KB once during mixed-result admission, not per target. Maximum repair labels/messages are explicit schema bounds, not truncation of identities. UI renders root error setup or partial-result setup once.
- No install/check MCP tool added. MCP execution performs progressive setup on its existing owned operation; a local human can use read-only CLI for diagnosis.
