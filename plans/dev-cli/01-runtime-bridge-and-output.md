# 01 — Private runtime bridge and output ownership

Status: **complete** (2026-11-04, see evidence). Dependencies: [00](00-baseline-and-contracts.md).

## Goal

Carry generation-scoped child observations and commands while retaining complete bounded stdout/stderr behavior and early binding.

## Source targets

- `packages/histoire-dev-proxy/src/protocol.ts`, `process/child.ts`, `index.ts`.
- `packages/histoire/src/node/commands/{dev,dev-child}.ts`.
- New lightweight `packages/histoire/src/node/terminal/{protocol,bridge,output}.ts` and child adapter under `node/runtime/terminal/`.
- Existing CLI fixtures; new focused bridge/output specs under `node/__tests__/terminal/`.

## Implementation steps

1. Add optional proxy output/runtime-event/diagnostic callbacks. Without output observer retain current piping; with observer consume each chunk once. Keep callback disposal/error handling independent from process cleanup.
2. Add generic runtime command/reply/event envelope variants. Preserve watch/ready/failed and shutdown behavior. Validate bounded JSON/generation/correlation before dispatch; Histoire payload parsing remains outside generic proxy package.
3. Expose current-generation command delivery through proxy handle. A listener existing does not imply a child is ready: return explicit starting/restarting/closed failure rather than queue commands onto unknown successor.
4. Parent bridge owns pending read registry and 10-second timers. Settle exactly once on reply, timeout, generation retirement, IPC disconnect, or shutdown. Test admissions never wait for test completion and never auto-retry on timeout.
5. Install child console observation before project imports. Format console arguments with Node formatting, retain level/multiline details, and suppress duplicate stream output only for intercepted calls. Preserve console assertions/timers/groups by wrapping their actual emitting behavior carefully; unsupported calls continue raw fallback rather than being dropped.
6. Retain direct stdout/stderr data using streaming UTF-8 decoder. Handle partial lines, carriage-return updates, stream-end flush, and oversized unfinished buffers. Strip untrusted terminal controls and redact configured credential before retention/render/copy. Emit explicit truncation and continue draining.
7. Route parent proxy diagnostics through optional callback, retaining console fallback for existing consumers. Avoid process-wide stdout/stderr patching in parent.
8. Restore only adapter-owned console hooks/listeners. Child close, failed startup, and old-generation late output must not remove successor hooks or keep IPC alive.

## Useful tests

- Actual child fixture emits console, direct stdout/stderr, split emoji bytes, carriage-return updates, no trailing newline, and oversized line. Assert retained text/level/truncation and lack of duplicate console record.
- Real IPC request waits while child retires. Assert rejection, then fresh generation request succeeds; release delayed old reply and prove it cannot settle new request.
- Existing proxy consumer with no callbacks still receives output. Callback-enabled consumer receives same meaningful content through observer without duplicate pipe.
- Existing early-bind config gate still responds while project evaluation is held. Import test/real entry must prove no eager project execution, not only inspect import statements.
- Sanitized history excludes configured credential and escape controls, including controls split across chunks.

## Acceptance criteria

All output reaches observer or fallback once, subject only to documented bounds. Pending reads cannot hang after retirement. Old messages cannot affect successor. Generic proxy remains framework-neutral and optional observer behavior remains backward compatible.

## Exclusions

No rendered TUI, catalog service, test executor, HTTP history, or public endpoint yet. Do not require MCP for transport.

## Handoff receipt

Record source changes, envelope definitions/bounds, actual CLI/process/output checks, cleanup behavior, and deviations in [evidence](evidence.md). 02 may use bridge only after old-generation and no-observer cases pass.
