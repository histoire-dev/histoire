# Slice 08 — optional browser reuse acceptance

Status: implementation and bounded live acceptance passed. This evidence does not declare M4 acceptance or establish a general performance improvement; parent owns combined acceptance.

## Implementation contract

`browser.reuse` defaults off. When enabled, one setup owner retains one browser process per generation, selected driver identity, and renderer source. Every capture still creates and closes a fresh browser context. `idleTimeoutMs` defaults to 30,000 and accepts only integer values from 1,000 through 300,000; supplying it while reuse is disabled is rejected. Node artifact environment variables still select renderer only and cannot enable process reuse.

Refreshing setup retires the prior pool. Idle processes close before a new generation acquires; a process with an active capture remains assigned until that capture releases or discards it. Healthy release schedules idle expiry. Uncertain context cleanup discards the exact browser process. A background close failure remains terminal across refresh and prevents discovery/acquisition from reporting a usable owner. Disconnect invalidates setup proof and affects only a later explicit operation; story capture is never replayed.

## Live harness

The opt-in tests live in `packages/histoire/src/node/__tests__/mcp/integration/browser-reuse.spec.ts`, gated by `HISTOIRE_BROWSER_REUSE_ACCEPTANCE=1`. They reuse `createMcpCaptureProject`, the actual dev runtime and preview host, `getContextScreenshotSetup`, and `createScreenshotTask`. A focused Vue fixture captures its `tone` prop and whether a cookie, local-storage key, document attribute, or body marker existed before mount; it writes those sentinels after reading them.

The five-capture case uses one runtime owner, 480×320 CSS viewport, DPR 2, and alternating PNG/WebP output. It checks actual PNG dimensions through `pngjs`, WebP container bytes and reported dimensions, nonempty artifacts within 4 MiB, each expected prop value, clean state at every mount, five distinct contexts, one browser handle, and one call through the project's real `chromium.launch`. It reads idle RSS only through the exact Playwright-owned child PID in `/proc/<pid>/status`, then closes through the normal project owner path and observes that child's exit.

A separate bounded fault case holds a real acquired context's `close()` promise. The session cleanup deadline must discard that exact browser process; the real execution service must quarantine its lane. Unit coverage separately covers cancellation while joining pool close, idle-expiry races, disconnect, refresh, and background cleanup uncertainty.

## Executed result

The gated integration suite passed on Linux x64 with Node 24.21.0, Playwright 1.59.1, headless-shell, and Chromium 147.0.7727.15. Five captures used one PID and one launch. All five props and isolation observations passed. Exact timings, RSS samples, and process-exit evidence are recorded in [receipt 08](./receipts/08.md).

The run used the already installed browser. It did not install browser assets or write to the browser cache. The timings are one bounded sample without a non-reuse baseline; do not report them as a comparative benchmark.
