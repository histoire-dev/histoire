# Ownership, compatibility, and security

## Shared files

Slice 01 owns protocol names, DTOs, capability/config fields, errors, and package compatibility decisions. Later slices may implement validators or exports only for their assigned API and must keep [contracts](contracts.md) authoritative. Serialize edits to `histoire-sdk/src/types.ts`, `histoire-protocol/src/index.ts`, bridge registries/validators, config types, and package manifests.

Slice 02 owns shared reader extraction and compatibility re-exports. Slice 03 owns runtime dispatch and browser inspection service. Slice 04 owns Node public wrappers and legacy MCP parity. Slice 05 owns trace model/observers. Slice 06 owns browser adapter; 07 owns broker; 08 owns agent/RPC bindings. Slice 09 owns framework hook and Vue implementation. Slice 10 owns axe integration. Slice 11 owns native panels/workbench integration. Slice 12 owns host/dock/report glue. Slice 13 owns WebMCP. Slice 14 owns exports, examples, docs, and packaging. Slice 15 owns final evidence and targeted repairs coordinated with original owner.

No simultaneous refactor and feature patch on shared runtime or bridge files. Add focused sibling modules and thin integration calls. Preserve concurrent dirty work; reread current file before editing. Do not reset, unstash, unstage, or regenerate unrelated files. Existing source paths exceeding 300 lines should gain small extracted collaborators rather than large additions.

## Reuse map

- DTO validation/byte budgets: `packages/histoire-protocol/src/bridge/{payload,results,envelope,limits,size}.ts`.
- SDK capture/invalidation: `packages/histoire-sdk/src/session/{request,ownership,context}.ts`.
- Frame identity/readiness: `packages/histoire-app/src/embed/adapters/{runtime-frame,runtime-requests,runtime-readiness}.ts`.
- Runtime readers: existing `node/mcp/browser/inspection/{state,dom,result}.ts`, extracted once by slice 02.
- Browser host/deadlines: `packages/histoire/src/node/runtime/browser/` and `runtime/execution-service.ts`.
- Node source acquisition/error mapping: `packages/histoire/src/node/api/{capture,execution,internal}.ts`.
- MCP observation/retention: `node/mcp/observer/` and `node/mcp/operations/`; Devframe live calls receive attributed activity records but never fake isolated execution jobs.
- Existing test fixtures: `packages/histoire-sdk/src/__tests__/`, `packages/histoire-vue/src/__tests__/fixtures/`, `packages/histoire/src/node/__tests__/utils/{embed,mcp}/`. Extend fixtures with optional inspection capabilities rather than clone source/browser harnesses.

## Trust boundaries

1. Histoire source decides whether runtime inspection is enabled and allowed across requesting origin.
2. SDK host chooses which session to attach and scopes to request.
3. Pairing grant binds authorized source/principal/scopes to authenticated browser connection.
4. Broker authorizes discovery and each capability call; adapter identity must come from verified transport credentials, not caller JSON or arbitrary headers.
5. Runtime validates original Histoire port/document/target identity. Devframe metadata cannot manufacture authority.

For built-in local hosting, use distinct secret for paired browser bootstrap and agent bearer authentication. Map successful agent authentication to configured principal. Custom hosts supply verified principal adapter. No default common principal for unrelated users. If pinned Devframe APIs cannot propagate verified per-request identity, mount Histoire's existing auth guard outside handler and inject trusted request context through tested adapter hook; do not fall back to trusting `Origin` or tool arguments. Slice 01 must prove this seam before 07/08 proceed.

MCP Origin checks and browser WebSocket trust are separate mechanisms. Keep exact allowed origins and peer checks; explicitly configured remote hosting needs credentials. Authorization denial leaves no session metadata, telemetry, or shared-state resource behind. Generic inspector queries only approved data sources; never hand it raw runtime/controller objects.

## Compatibility gates

- Existing MCP `tools/list`, schemas, annotations, error envelopes, URIs, and operation behavior match baseline after extraction. New live tools appear only on separate opted-in Devframe endpoint.
- Existing browser SDK `state.get/patch/reset`, channel behavior, one-primary ownership, implicit persistence defaults, and cross-origin policy unchanged.
- Existing inspection nonce/epoch path retained for isolated jobs. Live path obtains equivalent authority from authenticated runtime bridge; it must not copy or invent MCP nonces.
- Browser packages import with no DOM and without Node/MCP/Playwright/Devframe installed. Optional features resolve only when activated.
- Node deployment and owned stdio retain isolated functionality. Owned stdio does not discover unrelated user browser tabs; Devframe connector reaches explicitly hosted adapter endpoint.
- Static output has no listener/MCP service. Instrumentation may be built explicitly; ordinary static books remain unchanged.
- No new automatic execution retry, hidden remount, source fallback, queued mutation replay, or shared-state write authority.

## Upstream compatibility work, bounded

Slice 01 must record exact versions and test: browser entry import graph, custom named tool input/output projection, resource URI support, verified caller identity, cancellation signal propagation, `exposeSharedState: false`, targeted browser request/reply, host disposal, and built-in plugin lifecycle. Probe installed declarations and source, not doc badges alone.

If generic Devframe RPC projection changes Histoire field names or wraps arguments under `arg0`, use custom agent registration/adapter at new endpoint. If no upstream mechanism preserves raw MCP result envelopes, explicitly wrap using MCP SDK within adapter and document retained Devframe discovery/hosting benefits. Never migrate existing endpoint to achieve superficial reuse. Unsupported optional add-on/WebMCP capabilities remain explicitly unavailable; do not fabricate compatibility evidence.

## Handoff record per slice

Record changed paths, API exports, test commands/outcomes, browser/source identities, limitations, and follow-up dependencies in a new implementation evidence section. State whether result is unit, real browser, packed consumer, or CI proof. Pending cleanup, skipped browser dependency, and cancelled test run are not passes. Do not update old plan completion claims based on this new pack.
