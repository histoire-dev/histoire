# Devframe inspection, debugging, and SDK slice plans

Status: planned, refreshed 2026-10-07. This plan pack claims no implementation, dependency installation, runtime validation, or delivery. Initial baseline was `cf1b2adad7b316f2a60ee415d02ae3d3b3b57ab0`; compatibility refresh inspected `41565ecaedebe10350909d293461b21737aa1fd8` with concurrent uncommitted SDK/workbench changes. HEAD alone does not identify that working tree.

## Outcome

Inspect the actual component instance a user is interacting with from Histoire, a custom SDK host, and an agent. Keep deterministic isolated inspection for reproducible checks. Add optional Devframe integration over Histoire-owned contracts and services, preserving current SDK/runtime ownership and existing MCP wire behavior.

## Read first

1. [Architecture and repository seams](architecture.md).
2. [Authoritative public contracts](contracts.md).
3. [Ownership, compatibility, and security](coordination.md).
4. [Validation and acceptance matrix](validation.md).
5. [Research and baseline evidence](evidence.md).

Supporting documents own shared decisions; slices must not redefine them. New API snippets are proposed contracts, not currently available exports. Paths marked new are implementation destinations, not existing files.

## Slices

| Slice | Outcome | Prerequisites |
| --- | --- | --- |
| [01](01-contracts-and-compatibility.md) | Portable contracts, dependency compatibility proof, baseline | None |
| [02](02-shared-inspection-core.md) | Extract bounded inspection and isolated execution services | 01 |
| [03](03-live-browser-sdk.md) | Live SDK inspection through existing bridge | 02 |
| [04](04-node-sdk-and-mcp-parity.md) | Public isolated Node API; unchanged existing MCP | 02 |
| [05](05-debug-timeline.md) | Bounded, correlated runtime and SDK diagnostics | 03 |
| [06](06-devframe-browser-attachment.md) | Optional session attachment and browser RPC | 03 |
| [07](07-live-session-broker.md) | Paired sessions, exact routing, authorization | 06 |
| [08](08-agent-tools-and-discovery.md) | Live MCP tools, resources, discovery | 04, 05, 07 |
| [09](09-vue-component-inspection.md) | Framework hook and Vue component ownership/tree | 03, 08 |
| [10](10-accessibility-audits.md) | Shared axe scan service, SDK/Node/MCP results | 03, 04, 08 |
| [11](11-workbench-and-vue-panels.md) | Native inspection/debug panels and canvas actions | 05, 09, 10 |
| [12](12-devtools-hosts-and-reports.md) | DevTools docks, middleware, explicit static reports | 08, 11 |
| [13](13-optional-webmcp.md) | Feature-detected browser agent exposure | 08, 09, 10 |
| [14](14-packages-examples-and-docs.md) | Packed consumers, examples, public documentation | 12, 13 |
| [15](15-conformance-and-delivery.md) | Final integration, compatibility, lifecycle acceptance | 14 |

## Milestones

- **M1: live inspection.** 01–08. Change state in an SDK host; read identical state through MCP; replace the runtime and prove old requests cannot succeed against its successor. Includes bounded diagnostics needed by live tools.
- **M2: component debugging.** 09–11. Pick an element, inspect owning Vue component, correlate diagnostics, scan accessibility, and navigate source where available.
- **M3: portable integration.** 12–15. Optional DevTools host, static report, WebMCP capability detection, packed SDK consumers, and final conformance.

Dependencies permit independent implementation after prerequisites; they do not authorize subagents or concurrent edits. See shared-file rules in [coordination](coordination.md).

## Fixed scope

- Browser SDK works without Devframe. Public Node inspection works without Devframe or an MCP connection.
- Existing `histoire_*` isolated tools keep names, schemas, result envelopes, resources, and queue behavior. New live tools initially live on the explicitly enabled Devframe endpoint. Native endpoint migration is excluded.
- Cross-origin SDK hosts continue using Histoire's authenticated bridge; Devframe does not replace its handshake.
- Vue component tree is first implementation. React/Svelte retain generic state/DOM inspection and explicitly report component-tree capability unavailable.
- No arbitrary JavaScript evaluation, full CDP/network profiler, component-instance mutation, automatic replay, or automatic installation.
- No React/Svelte tree parity, render profiler, reactive dependency graph, general state time travel, or replacement workbench shell in this pack.
- Source/test modules remain under 300 lines where practical. Add JSDoc to APIs and properties. Reuse existing fixtures and serializers; test meaningful behavior rather than classes/styles.
- First-party UI text stays English and avoids “preview”; technical identifiers and user-authored content remain unchanged. Workbench empty areas use `WorkbenchEmptyState`.
- No staging, commits, pushes, publication, or deployment without explicit instruction.
