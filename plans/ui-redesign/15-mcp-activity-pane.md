# 15 — MCP activity pane

## Outcome and prerequisites

Depends on: 02, 04, 14 (UI channel). Dev only.

The MCP rail pane shows server status and endpoint (copy client config), connected clients, the current operation with progress and cancel, a history of tool calls with status icons, and a Follow switch. With Follow on, the canvas selects and outlines the frame an operation targets and shows the client's labelled cursor. The Home "Agent activity" card (slice 10) reads the same snapshot.

## Owned files

- Add `packages/histoire/src/node/server/ui-channel/mcp.ts`: subscribes to the MCP dev runtime (`mcp/dev-runtime.ts`) and operation store (`mcp/operations/store.ts`) and emits `histoire:ui:mcp-snapshot` / `histoire:ui:mcp-operation`; handles `histoire:ui:mcp-cancel`.
- Add minimal observer hooks to the MCP operation store and session tracking if none exist (read-only events; no contract change to MCP tools).
- Add `app/stores/mcp.ts` and `app/components/panes/mcp/{McpPanel,McpEndpoint,McpClients,McpCurrentOperation,McpHistory}.vue`.
- Add the follow overlay in `app/components/canvas/AgentCursor.vue`.

## Tests first

1. Snapshot reflects enabled/disabled MCP (`--no-mcp`), endpoint URL, and clients connecting/disconnecting.
2. Operation lifecycle events (queued → running with progress → done/failed/cancelled) arrive in order; history keeps the last 50.
3. Cancel from the UI cancels exactly that operation through the existing MCP cancellation path and is reported as cancelled.
4. Follow mode: an operation targeting `{storyId, variantId}` navigates there (only when Follow is on) and outlines the frame; turning Follow off stops navigation without dropping events.
5. Payloads never include auth tokens, request bodies beyond tool name/target, or file contents.
6. Static builds include none of this code.

## Implementation steps

1. Observer API on the MCP side: `onClientChange`, `onOperationChange` returning unsubscribe functions; emitted DTOs are projections, not internal objects.
2. Copy client config produces the JSON snippet for stdio and HTTP transports from the runtime's actual endpoint.
3. Rail badge shows a dot while an operation runs.

## Failure paths

MCP runtime restart sends a fresh snapshot; the UI clears stale running states. Channel disconnect shows "MCP status unavailable".

## Validation commands

~~~bash
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire test:mcp:integration
pnpm --filter @histoire/app build
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the MCP pane boards; a real MCP client (stdio and HTTP) run against the vue3 example shows live operations, cancel works, Follow moves the canvas.

## Non-goals

New MCP tools, remote/deployed MCP monitoring, auth configuration UI.

## Handoff

Observer hooks and snapshot DTOs for slice 16 (agents may run through MCP) and for MCP plan maintainers.
