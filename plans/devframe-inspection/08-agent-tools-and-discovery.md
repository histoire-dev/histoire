# 08 — Agent tools, resources, and discovery

## Outcome and prerequisites

Depends on: 04, 05, 07. Expose current live session state through explicitly hosted Devframe MCP endpoint; preserve native isolated endpoint.

## Owned files

- New `packages/histoire-devframe/src/services/{descriptors,inspection,events,diagnostics}.ts` and `src/node/agent/{tools,resources,results,discovery}.ts`.
- Adapter transport/auth integration seam selected in 01; no duplicate native MCP server factory.
- Actual MCP client integration tests, discovery subprocess test, shared-state leak test, and legacy native endpoint regression fixture.

## Tests first

1. User changes state in real SDK host; `histoire_inspect_session` returns same document/state. Public Node isolated read remains fresh and distinct.
2. `tools/list` yields exact names and strict input/output shapes in contracts; no `arg0` surprise or double-wrapped envelope.
3. Authorized session resources work with unusual IDs; unauthorized/expired attachments fail. General Devframe state resources expose no project/session data.
4. HTTP cancellation and timeout cancel pending browser request; stale response never becomes successful MCP reply.
5. Real `devframe connect` discovers correct endpoint at nested base and calls tool; session selection remains explicit.
6. Native HTTP/stdio/Node MCP tool/resource/operation compatibility remains unchanged; missing agentic peer leaves core SDK functional.

## Implementation steps

1. Build finite service descriptor registry with schemas, capabilities, classification, and handlers. Reuse it for Devframe RPC and custom agent registrations. Use slice-01 chosen transport seam; when direct MCP SDK adaptation is necessary, carry verified request context and MCP cancellation into the shared dispatcher explicitly. Register each tool once; automatic Devframe projection must not produce an unguarded duplicate endpoint.
2. Register list/inspect/events/diagnostics and opt-in highlight tools. Add component/audit descriptors in 09/10 only after implementations exist; no tool per component/session.
3. Normalize domain errors into Histoire envelope, preserving `isError` and JSON compatibility text where supported by pinned SDK. Honor existing size/error sanitization.
4. Register bounded summary resources and return canonical URIs. Validate lifetime/principal on reads; do not serialize complete SDK snapshots.
5. Explicitly disable generic shared-state MCP exposure and default auto-MCP hosting. Adapter host opts in; origin gate and principal policy both apply to every RPC/resource/tool path. Keep discovery summaries in broker, not globally shared state. Trace authorized live calls with correlation ID passed to SDK; retain Node activity in existing observer with no secret inputs. A diagnostics grant opens one explicit browser debug observation and awaits its ready handle; observation loss is reported until caller explicitly renews attachment/observation.
6. Advertise endpoint through standard Devframe connection metadata/instance discovery at correct base. Keep secrets out of registry/CLI/URLs. Dispose registrations with host.
7. Keep native endpoint unchanged; document connector reaches new adapter endpoint, not arbitrary existing Histoire server merely by process discovery.

## API changes

New live tools/resources defined in contracts. Direct bounded replies, no fabricated native operation handles. Existing isolated tools remain on native MCP endpoint; no duplicate aliases required on new endpoint.

## Failure paths

Stateless HTTP cannot promise asynchronous tool/resource notifications. Use explicit listing/polling; feature-detect optional stdio notification support without changing correctness. Adapter annotations describe behavior and never replace authorization.

## Validation commands

Adapter `test:integration` with real MCP clients and connector process, legacy `test:mcp:integration`, schema conformance, missing-peer probe, scoped lint/build.

## Acceptance criteria

M1 scenario passes end to end, scopes enforced over actual HTTP, and legacy MCP remains compatible. Tool descriptions state live/fresh semantics and side effects clearly.

## Non-goals and handoff

No native MCP migration, arbitrary eval, state edits, test execution on live tab, or blanket MCP subscriptions. Hand off service descriptor extension pattern to 09/10/13 and endpoint hosting contract to 12.
