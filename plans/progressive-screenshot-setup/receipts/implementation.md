# Progressive screenshot setup — combined implementation receipt

Date: 2026-10-08. User authorized implementation through `gpt-6-luna` subagents with max reasoning and separate file ownership. No staging, commit, push, publication, or deployment. Unrelated concurrent ACP, visual-testing, and workbench edits remain outside this task.

## Current outcome

Slices 01–08 are implemented. Optional reuse remains off by default. Linux consumer acceptance and bounded reuse isolation proof passed. Slice receipts contain exact ownership and commands; this receipt records combined evidence without adding individual test counts together.

- Screenshots use project-first `playwright` or `playwright-core`, then compatible installed browser candidates. Playwright 1.49+ uses shell, cached full Chromium, stable Chrome, then Edge. Older drivers use cached regular Chromium before branded channels.
- Explicit sources never fall back. Automatic fallback stops before story navigation on unknown failure, cancellation, timeout, or uncertain cleanup.
- Neutral probes use disposable contexts. Metadata reads do not launch; checks run in the existing execution lane. Setup and capture never install dependencies.
- Setup UI and `histoire screenshot-setup` expose finite, scrubbed diagnostics and static repair commands. Check-again refreshes before probing; cancellation belongs to the originating UI request.
- Browser policy stays out of client config. Copied Node artifacts pin one optional selected driver and use target-owned environment policy rather than build-machine browser paths.
- Captured generations own setup state and cleanup. Refresh cannot overwrite a newer inventory with an old discovery result, cancel an unrelated story lease, or recover an unsafe cleanup lane.

## Combined verification completed

- Parent final regression run: **41 files, 272 tests passed** in 4.70 seconds. Included config/discovery/acquisition/report/probe/generation, process-pool unit state machine, UI channel/service, CLI, MCP screenshot/readiness/cleanup/inspection/capabilities, Node package/artifact/server, and built hosting/cleanup suites. This final run includes optional reuse, safe detailed diagnostics, small-viewport contracts, and review fixes for held-discovery cancellation and socket ownership.
- Shared and Histoire TypeScript emission passed using Node 24.16.0. Slice owners also passed their final `tsc --noEmit` checks.
- App production build passed: main bundle, embed bundle/types, CSS, and copied assets. UI setup/overflow behavior tests and targeted ESLint passed; see slice 05 UI receipt.
- Stable built MCP stdio integration passed **4 tests**. Initial failures overlapped dist emission or sandbox listener restrictions; isolated stable-build runs passed. Dist writes are coordinated for consumer runs.
- Packed core-only consumer gates passed **2 real integration tests**, 28.62 seconds combined, on Fedora 44 Linux with Playwright Core 1.59.1 and Chromium 147.0.7727.15. See slice 07 receipt for exact command.

The packed gate verified empty-cache repair, launch-free metadata, matching shell-only and full-only caches, exclusive missing executable failure, one core optional dependency, private path exclusion, and no `playwright` or Vitest peers. After copying Node artifact and deleting original project, production MCP capture returned decoded 960×640 PNGs at DPR 2 with correct theme pixels, transparency, and different hashes across themes.

Temporary consumer dependency installation used existing package helpers. No browser download, browser-cache deletion, or OS dependency installation occurred.

The second packed consumer gate verified launch-free toolbar metadata, explicit shell setup check that removes setup UI before revealing capture controls, saved and decoded UI PNGs including exactly 128×96 selected through custom viewport toolbar fields, MCP screenshot/DOM inspection, and public `histoire/node` SDK capture. Dev and SDK used an isolated shell-only cache; external UI automation used an explicit existing full Chromium executable. No `playwright` package resolved in that consumer.

## Review fixes

Acquisition now stops while metadata discovery is held when caller cancels, deadline expires, or owner closes. Late metadata cannot launch for the stopped operation. Socket closure cancels only originating client's setup check or batch capture, stops remaining targets, suppresses dead-client replies, and removes observers; other clients and MCP work survive. Test-first and independent review evidence appears in [review follow-up](review-fixes.md), including one adjacent unchanged config-test fixture failure.

## User-reported failures resolved

- Setup and capture controls are mutually exclusive. Missing/unverified/failed setup shows diagnosis and check/repair actions; ready setup shows capture controls and recent files. Capture setup failures return to setup view.
- Failed attempts include selected driver/version, actual failure stage, and finite safe causes such as missing library or process exit. Unknown causes are explicitly unknown; raw paths and logs never reach the UI.
- A confirmed cause of `Invalid screenshot options` was the shared 320×240 minimum inconsistent with positive canvas sizes; the original user request was not intercepted. UI/API/MCP now accept positive integer CSS sizes from 1×1 through unchanged maximums. No enlargement or zoom multiplication was added. Invalid width/height receive specific validation messages. Real SDK and packed toolbar regressions decoded exactly 128×96 PNG output. The existing dev process must restart to load changed Node validation; client HMR alone cannot replace that backend module.
- UI behavior tests passed 18 tests in three files. App-wide Vue typecheck still reports an unrelated concurrent `CanvasViewport.vue:117` story-type error for `responsiveDisabled`; the production app build passed.

## Optional reuse proof and remaining gates

- Optional reuse passed two live-browser tests: five captures used five isolated contexts and one process; held context cleanup discarded that exact process and quarantined its lane. One sample measured 1,302.57 ms cold and 520.40 ms median across four subsequent captures, with 99,296–99,728 KiB idle RSS and exact child exit on close. No non-reuse baseline was collected, so no comparative speed claim is made. See [slice 08](08.md).
- Installed stable Chrome/Edge smoke tests remain unverified because those browsers are absent on this machine.
- Windows/macOS live smoke tests remain unverified. Platform candidate metadata tests pass; they do not substitute for live renderer proof.

No blanket cross-platform M3 or M4 performance acceptance claimed.
