# Progressive screenshot setup

Status: implementation complete, 2026-10-08. Slices 01–08 have implementation receipts; Linux packed core-only, copied-artifact capture, and optional reuse isolation gates pass. Branded browser and Windows/macOS live smoke gates remain open. See [combined implementation receipt](receipts/implementation.md) for current evidence.

Original planning inspection used HEAD `0bae61e3e1d500773b26f6ed9c0e3f30f5e33234`, with unrelated concurrent workbench/test edits. HEAD does not identify the entire working tree. No commit, push, publication, or deployment performed.

## Outcome

Make screenshots available with the least additional setup that preserves real browser rendering. Try already available compatible browser installations, stop at the first setup that works, and otherwise show the smallest relevant installation or repair step. Keep manual and agent captures on the same implementation.

There are two different progressions:

1. **Implementation:** independently useful slices, beginning with smaller installation instructions.
2. **Runtime:** finite discovery and browser startup attempts, followed by explicit installation guidance only when no existing setup works.

Do not conflate an unavailable browser with a broken story. Do not install packages, browsers, or OS libraries as a side effect of opening Histoire, reading MCP metadata, or requesting a screenshot.

## Read first

- [Architecture and repository seams](architecture.md).
- [Contracts, candidate order, and stop rules](contracts.md).
- [Research and baseline evidence](evidence.md).
- [Validation and handoff requirements](validation.md).

These documents own shared decisions. Slice receipts identify implemented APIs and remaining acceptance gates; the original plans retain their implementation instructions.

## Slices

1. [01 — Headless-only installation guidance](01-headless-only-guidance.md). No prerequisites. Ship smaller setup instructions using current runtime.
2. [02 — Configuration, driver discovery, and setup contracts](02-discovery-and-contracts.md). Requires 01. Discover candidates without launching or installing anything.
3. [03 — Progressive browser acquisition](03-progressive-acquisition.md). Requires 02. Try candidates under bounded ownership; stop on success or terminal failure.
4. [04 — Shared UI, Node SDK, MCP, and inspection integration](04-shared-runtime-adoption.md). Requires 03. All capture entrypoints use the same selection and repair logic.
5. [05 — Setup check and targeted repair UX](05-check-and-repair.md). Requires 04. Read-only CLI and dev UI show what works or what to install next.
6. [06 — Node deployment portability](06-node-deployment.md). Requires 04, 05. Discover deployment-machine browsers without serializing build-machine paths.
7. [07 — Consumer proof and release acceptance](07-conformance-and-docs.md). Requires 05, 06. Validate real consumers, fresh setup states, and unchanged capture fidelity.
8. [08 — Optional browser process reuse](08-optional-browser-reuse.md). Requires 07. Separate runtime optimization; not needed for progressive setup acceptance.

Implement 01 through 07 in order. Slice 01 is useful alone. Slices 02–03 establish the resolver but are not feature acceptance until adapters land in 04. Stop implementation after any accepted milestone if requested; record exactly what is enabled.

## Milestones

- **M0, smaller documented install:** 01. Screenshot runtime unchanged.
- **M1, existing-browser enablement:** 02–04. Cached shell/full Chromium or installed Chrome/Edge works through all dev capture entrypoints.
- **M2, understandable setup:** 05. User sees a working choice or a targeted next command; no automatic installation.
- **M3, portable acceptance:** 06–07. Packed consumers and Node artifacts obey the same policy.
- **M4, optional faster repeats:** 08. Process reuse proven independently; no speed claim without measurements.

## Fixed decisions and assumptions

- Preserve browser-native screenshot fidelity. Browser-side DOM export is excluded from this chain; it cannot silently replace Playwright capture.
- Existing compatible pinned browser builds have priority over installed branded browsers. This minimizes extra setup while preserving existing rendering where possible.
- Keep `playwright` optional. Accept an explicitly installed `playwright-core` for screenshot/inspection execution only; do not add a hard dependency or weaken project Vitest prerequisites.
- `auto` may select installed Chrome/Edge when pinned binaries are absent or have a classified startup failure. An explicit browser choice never falls back to a different browser.
- Full Chromium download is an explicit final alternative for a confirmed shell-specific requirement. It is not the generic remedy for missing OS libraries, permission errors, story errors, or unknown launch failures.
- First-party UI remains English and avoids “preview”. Preserve existing technical names and protocol values containing that word.
- Reuse existing queue, host, serializer, cleanup, and test fixtures. New source/test modules stay under 300 lines where practical; JSDoc documents functions and properties.
- Preserve unrelated dirty/staged/untracked work. The original pack was planning-only; the user subsequently authorized implementation with Luna agents at max reasoning. Staging, commits, pushes, publication, and deployment remain unauthorized.

## Receipt per slice

Record changes, owned files, focused test commands/results, real-browser evidence if required, unresolved baseline failures, and remaining gates in a new dated receipt under this folder. Do not edit existing plan status to claim a slice complete before its acceptance gate passes.

- [01 — Guidance](receipts/01.md)
- [02 — Discovery and contracts](receipts/02.md)
- [03 — Acquisition and cleanup](receipts/03.md)
- [04 — Runtime adapters](receipts/04.md)
- [05 — UI](receipts/05-ui.md) and [backend/CLI](receipts/05-backend.md)
- [06 — Node deployment](receipts/06.md)
- [07 — Consumer conformance](receipts/07.md)
- [08 — Optional reuse](receipts/08.md)

- [Review follow-up — cancellation and socket ownership](receipts/review-fixes.md)
