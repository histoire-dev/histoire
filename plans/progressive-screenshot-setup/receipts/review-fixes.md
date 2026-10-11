# Review follow-up — 2026-10-08

Status: both findings fixed and verified. User authorized fixes for two P2 findings from three Luna max review agents. No staging, commit, push, browser installation, or OS installation.

## Findings and required behavior

1. A capture/setup acquisition directly awaited metadata discovery before checking cancellation and its absolute deadline. A held driver import or filesystem check could keep the execution lane occupied after cancellation or timeout. Acquisition must stop without awaiting that metadata, and late discovery must never launch a browser for the stopped operation. Owner close must also complete when discovery is held.
2. Screenshot setup and batch capture requests observed explicit cancellation and whole-channel cleanup, but not closure of their originating Vite websocket. Socket closure must cancel only that client's work, skip remaining capture targets, suppress replies to the dead client, and remove request listeners when finished. Other clients and MCP lane work must survive.

Review also considered cached candidate probe reuse. Slice 03 explicitly permits omitting redundant neutral probes while driver/selection/generation remains valid; this was retracted and is not a fix requirement.

## Implementation

- `setup/authority.ts` now races shared metadata through existing `waitForRuntimeWork` against caller cancellation, absolute deadline, and owner inactivity. `setup/owner.ts` uses that bounded wait around complete discovery; stopped current acquisition resets transient checking state to unverified. Metadata itself remains observed and generation-guarded, so a late result can inform future work but cannot launch for the stopped acquisition.
- `ui-channel/client-connection.ts` observes one request's actual Vite socket, checks ready state before admission, delivers closure once, and exposes explicit listener disposal. Screenshot and setup handlers attach this observer before admitting work, cancel exact client/request, guard responses, and dispose after completion or channel shutdown.
- Shared UI test clients use real `EventEmitter` close events and one reusable disconnect method. Tests execute real setup owner/session, channel handlers, execution queue, capture task, and screenshot persistence while controlling only external driver/browser/socket boundaries.

## Verification

- Test-first evidence: held-discovery regressions failed before runtime fix; six socket-close/admission regressions failed before channel fix.
- Final parent regression run passed **41 files, 272 tests**, 4.70 seconds. Includes session/owner cancellation, timeout and close while driver discovery is held; no late browser launch; batch cancellation after one saved frame; other-tab and queued MCP survival; listener removal; already-closing socket rejection; existing setup, reuse, config/privacy, CLI, MCP, deployment, and cleanup suites.
- Core TypeScript emission and scoped ESLint passed. No app source changed, so previous production app build remains applicable.
- Both real packed browser consumer gates passed, **2 tests in 28.62 seconds**. Core-only dev toolbar saved exactly 128×96 PNG; MCP/SDK capture and copied Node artifact capture remain functional. Existing installed assets only; no browser or OS installation.
- Independent read-only review found no concrete issue in the fixes. Source/test files remain at most 300 lines. `git diff --check` and plan links/fences passed.
- Initial combined listener tests failed with `listen EPERM`; approved local-listener execution passed all 272 tests.

## Evidence limits

Adjacent `config-save-recovery.spec.ts` still fails its JavaScript-destination case. Its unchanged fixture symlinks `node_modules/histoire` to `/home/akryum/Projects/histoire/packages`, rather than `/home/akryum/Projects/histoire/packages/histoire`, and the generated config import fails verification. This test does not use screenshot/setup handlers; no unrelated test/config changes were made. Original platform limits and unrelated Vue typecheck baseline remain recorded in the combined receipt.

