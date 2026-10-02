# Slice 06 — Stdio command and owned project worker

## Outcome and prerequisites

MCP hosts launch `histoire mcp` and get protocol-clean stdout while project code/logging runs in owned child. Depends on 02 and 05. No HTTP endpoint is started in stdio mode.

## File ownership

- Modify `packages/histoire/src/node/bin.ts` with dynamically imported `mcp` command.
- Add `packages/histoire/src/node/commands/mcp.ts`.
- Add `packages/histoire/src/node/mcp/transport/{stdio,worker-client,worker-entry,worker-protocol,worker-dispatch}.ts`.
- Add `packages/histoire/src/node/__tests__/mcp/{stdio,worker-ipc}.spec.ts`.
- Extend shared process/client fixture helpers for built entrypoint testing.

## Tests first

1. Built CLI process completes current SDK discovery and legacy initialization, lists/calls tools/resources, and emits only valid SDK protocol messages on stdout.
2. Config logs via console.log, plugin logs, direct child stdout writes, and test runner logs appear on stderr without corrupting parent stdout. Child pipes are drained under large logging volume; bounded forwarding queue cannot grow forever.
3. Root/config path containing spaces, launch cwd differing from project, and config failure produce correct root or actionable failure. Parent cwd is unchanged.
4. Request IDs isolate concurrent IPC responses; invalid/unknown IDs cannot settle another request. Worker crash rejects pending requests once and exits parent with nonzero status.
5. stdin EOF, SIGINT, SIGTERM, and parent IPC loss close worker runtime and browser children. Deadline escalation targets only owned child, never broad process-name kill.

## Implementation steps

1. Add command options `--root <directory>` and `-c, --config <file>`. Resolve root relative to launch cwd; config relative to selected root. Only local existing directory accepted. No caller-initiated root switching or attach-to-arbitrary-URL mode.
2. Keep `bin.ts` startup code free of project imports. Command resolves worker entry relative to compiled `import.meta.url`; no repository source path or cwd-based entry lookup.
3. Spawn Node child with IPC, cwd selected root, stdin ignored, stdout/stderr piped. Set Histoire/dev environment in child as existing CLI does; remove HISTOIRE_MCP_TOKEN before project code executes. Child starts controller with UI host 127.0.0.1, port 0, open false, and explicit dev-HTTP MCP disabled. New dev default must not create duplicate listener for stdio worker; operation facade/preview host remain available.
4. Parent imports `serveStdio` and shared server factory, using a project proxy. Start IPC readiness asynchronously; serve get_project status while waiting. Parent never imports/evaluates project config, Vite, or browser runner.
5. Define strict IPC messages for status, request, result, cancel, and shutdown using contracts. IDs include random request nonce/counter scoped to parent process. Values are serialized DTOs/errors, never Context/functions/live servers. Bound metadata messages to 128 KiB and binary-resource response messages to 6 MiB (base64 expansion of max 4 MiB PNG plus envelope); reject unexpected oversized messages without leaking contents.
6. Child dispatches finite facade methods; reject arbitrary method/module names. Worker transport may relay future execution methods from 08–10 through same dispatch registry.
7. Propagate request AbortSignal/cancellation to child where supported by SDK revision. Cancellation of accepted long operation is through explicit operation tool; cancelled admission still reconciles by requestKey if work was accepted.
8. Forward child diagnostics to stderr, with bounded buffers/backpressure handling. Do not monkey-patch global console in parent or rely on console-only interception.
9. Shutdown stops admission, asks child to close, waits bounded graceful cleanup, then terminates exact owned child if needed. Child also closes on `disconnect` independently. Remove signals/listeners, settle IPC map, and close SDK helper according to pinned API.

## Acceptance and validation

Run real built-CLI stdio/IPC suites using official client, core build, focused lint, and repeated start/stop probe. Assert stdout line validity and process exit, not command exit alone. Integration test covers hostile project log plus one source resource read.

## Non-goals and handoff

No custom JSON-RPC parser, proxy to remote MCP, global client configuration edits, or daemon discovery files. Handoff includes documented CLI flags, process ownership, cancellation propagation, and built-entry launch evidence.

## Implementation evidence (2026-10-02)

Implemented `histoire mcp --root <directory> -c <file>`. Parent preserves launch cwd, resolves existing root and relative config, serves official SDK stdio through an asynchronous factory, and never evaluates project config/Vite. Compiled worker entry resolves from `import.meta.url`. Child owns loopback ephemeral UI, disables opening and dev HTTP, strips `HISTOIRE_MCP_TOKEN`, and forwards all stdout/stderr through native bounded stream backpressure to parent stderr.

Finite IPC validates public input/output schemas, exact independent request IDs, 64 outstanding requests, 128 KiB metadata and 6 MiB PNG resource frames. Unknown response IDs cannot settle another request. SDK request AbortSignal reaches IPC cancellation; accepted operation admission remains reconcilable by original requestKey. Child shares execution/operation services and drains invalidated epochs before project teardown. Screenshot executor registration occurs before boot discovery; slice 10 must register its concrete test executor at the same worker-runtime seam.

Immediate EOF, SIGINT, SIGTERM, worker crash/disconnect, and failed cleanup stop exact owned processes. Parent observes EOF while worker imports are pending through SDK transport, without consuming protocol bytes itself. Confirmed nonzero cleanup and deadline escalation remain failures.

Validation: core build and focused ESLint pass with zero warnings/errors. Final Node22 run passes 3 files/12 tests; IPC protocol/client suites pass 8 useful tests, including reversed replies, unknown IDs, crash rejection, cancellation, official SDK cancellation, and cleanup failure. Real built CLI checks pass current `2026-07-28` and legacy `2025-11-25`, noisy config/plugin/direct stdout plus 256 KiB logging bursts, root/config spaces, unrelated cwd, secret removal, exact raw CRLF source tool/resource, loopback preview, SIGINT/SIGTERM port release, immediate EOF, and actionable config failure. Dedicated compiled stdio suite is currently `src/node/__tests__/mcp/stdio.spec.ts`; slice 14 must move it into explicit integration configuration. Browser screenshot/test execution and clean packed consumer remain later slices, not claims of this validation.
