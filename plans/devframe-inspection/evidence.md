# Research and planning evidence

Inspected 2026-10-06. Planning baseline HEAD: `cf1b2adad7b316f2a60ee415d02ae3d3b3b57ab0`; working tree includes concurrent source edits. No implementation tests run for this plan pack.

## Repository evidence

- [Current MCP reference](../../docs/reference/mcp.md): fresh isolated mounts, state/DOM/ARIA/diagnostics tools, bounds, resources, ownership, and transport contracts.
- [SDK reference](../../docs/reference/sdk.md) and [public types](../../packages/histoire-sdk/src/types.ts): no inspection API today; runtime identity and session lifecycle already exist.
- [Node public types](../../packages/histoire/src/node/api/types.ts) and [capture service](../../packages/histoire/src/node/api/capture.ts): reusable public operation/lane pattern; existing screenshot default 480×320 must not change.
- [Bridge command registry](../../packages/histoire-protocol/src/bridge/types.ts), [payload validation](../../packages/histoire-protocol/src/bridge/payload.ts), [wire budgets](../../packages/histoire-protocol/src/bridge/limits.ts): finite validated protocol and existing roles.
- [Runtime service](../../packages/histoire/src/node/virtual/preview-runtime/runtime-service.ts): isolated safe state projection currently depends on MCP folder.
- [Element inspection](../../packages/histoire/src/node/virtual/preview-runtime/element-inspection.ts): existing picker/measurement seam.
- [Existing SDK plan](../embeddable-sdk/README.md) and [MCP plan](../mcp-server/README.md): compatible ownership conventions; completion claims remain scoped to their own evidence.

## Official upstream sources

- [RPC](https://devfra.me/guide/rpc): typed bidirectional operations, schema validation, browser registration, static dumps. Plan uses adapters rather than duplicate readers.
- [Agent-native API](https://devfra.me/guide/agent-native): opt-in RPC/custom tools/resources; generic shared-state exposure defaults on; WebMCP is experimental. Plan disables generic state exposure and uses a finite manifest.
- [MCP adapter](https://devfra.me/adapters/mcp): optional `@devframes/agentic`, stateless HTTP, stdio, discovery, origin/identity distinctions. Plan requires explicit hosting and verified principal routing.
- [In-page channel](https://devfra.me/guide/in-page-channel): same-origin handshake, MessagePort topology, page-authoritative state. Plan preserves Histoire cross-origin bridge and rejects reconnect mutation replay.
- [Client](https://devfra.me/guide/client): connection trust, browser functions, external viewers, disposal/reconnection considerations. Transport API details require installed-version probes.
- [Inspector](https://devfra.me/add-ons/devframes/inspect): RPC/state/agent/history inspection. It does not supply framework component trees.
- [Accessibility add-on](https://devfra.me/add-ons/devframes/a11y): axe in page script plus panel/highlight; instrument story document, not shell.
- [Hub](https://devfra.me/guide/hub), [client context](https://devfra.me/guide/client-context), and [services](https://devfra.me/guide/services): optional dock/service integration; avoid replacing caller's hub context.

These sources establish available concepts, not compatibility with Histoire's exact installed toolchain. Pages observed across 1.1/1.2 badges and older experimental wording. Slice 01 owns exact package/source verification and records immutable version references before shipping code.

## Planning verification

Completed planning audit on 2026-10-06:

- 21 Markdown documents: 15 implementation slices and six supporting documents.
- 50 local Markdown link targets resolved.
- 25 dependency edges checked; graph acyclic and README prerequisites match every slice.
- Every slice contains outcome/prerequisites, owned files, tests-first scenarios, implementation steps, API changes, failure paths, validation commands, acceptance criteria, and non-goals/handoff.
- Code fences balanced; no trailing whitespace in new documents. `git diff --check` passed for tracked working-tree changes; separate text audit covered these untracked plans.
- Contract review aligned debug subscription readiness/cleanup, attachment handle, correlation metadata, capability staging, and authorization across RPC/resources/MCP. Discovery summaries stay out of generic shared state.
- This request added only `plans/devframe-inspection/` documents; no implementation, staging, commit, or push performed. Unrelated concurrent working-tree edits retained.

Implementation/browser/packed-consumer/CI gates remain unrun. Upstream API compatibility probes and pinned package choices remain slice-01 implementation work, not evidence established by documentation research.

## Compatibility refresh, 2026-10-07

- Current checkout HEAD: `41565ecaedebe10350909d293461b21737aa1fd8`; concurrent source changes retained. Refresh modifies plan documents only.
- [Capability validator](../../packages/histoire-protocol/src/bridge/catalog.ts) rejects unknown capability keys. [Descriptor-field validator](../../packages/histoire-protocol/src/bridge/source-descriptor.ts) rejects unknown nested embed/config keys. Revised contracts use optional top-level `inspection` and `inspectionPolicy` extensions, with exact config origin allowlist. Baseline reader compatibility across handshake, updates, and snapshots remains mandatory in slice 01.
- Rechecked official [agent-native API](https://devfra.me/guide/agent-native) and [MCP adapter](https://devfra.me/adapters/mcp): retain explicit generic shared-state opt-out, automatic MCP hosting opt-out, strict named tool schemas, and experimental WebMCP boundary. Documentation does not prove authenticated principal or cancellation propagation to custom handlers; real transport probes remain required.
- Implementation scope remains the 15 slices and three milestones in README. No implementation or package compatibility completion inferred from these planning checks.
- Refreshed planning audit passed: 21 documents, 15 complete slice structures, 52 local links, 25 acyclic dependency edges matching README, balanced fences, and clean whitespace. Separate text audit covers untracked plans; `git diff --check -- plans/devframe-inspection` alone does not inspect untracked contents.

## Final plan review, 2026-10-07

- Re-read current capability/descriptor validators and SDK package boundaries; confirmed optional top-level extensions remain the proposed compatibility path, pending frozen-reader integration tests.
- Rechecked official RPC, agent-native, and MCP documentation linked above. Kept exact-version API probes as implementation gates; documentation alone does not prove request identity, cancellation, raw envelopes, or registration cleanup.
- Added mandatory browser principal resolver alongside per-call authorization, separate MCP request identity, explicit MCP SDK adaptation fallback, exact grid-cell owner handling, non-revivable expired leases, byte-bounded pagination, and collector cleanup probes. These are proposed requirements, not implemented capabilities.
- Final automated planning audit passed: 21 documents, 15 complete slice structures, 52 existing local link targets, 25 acyclic dependency edges matching README, balanced code fences, and no trailing whitespace. Text audit included untracked plans. Scoped `git diff --check` also passed.
- This final review changed plan documents only. No implementation tests, dependency installation, staging, commits, or push performed for this planning request.
