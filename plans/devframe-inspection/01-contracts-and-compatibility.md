# 01 — Contracts and compatibility

## Outcome and prerequisites

Depends on: none. Freeze [contracts](contracts.md), prove upstream seams, and create optional package skeleton before runtime edits.

## Owned files

- New `packages/histoire-protocol/src/types/{inspection,inspection-components,debug}.ts` and focused validation modules under `src/inspection/`.
- Extend protocol `types/{common,error,source-descriptor}.ts`, exports, and optional descriptor validation.
- Config types in `packages/histoire-shared/src/types/config.ts`; project config defaults and dev/static source projection consume them. Reuse embed origin helpers without extending legacy strict embed-policy fields.
- New `packages/histoire-devframe/{package.json,tsconfig.json,vitest.config.ts,src/types.ts}`; separate client/node build entries.
- Protocol tests `inspection-contracts.spec.ts`, `inspection-capabilities.spec.ts`; adapter `compatibility.spec.ts` and import tests.
- `evidence.md` compatibility matrix; only scoped manifest/lockfile updates.

## Tests first

1. Old descriptor without inspection accepted; disabled/partial capability never allows new command. Frozen old SDK/new descriptor fixture establishes compatibility through handshake and updates, not just validation by new code. Nested unknown capability/embed keys still reject; proposed top-level `inspection` and `inspectionPolicy` extensions preserve old behavior.
2. Strict DTO validators reject unknown keys, unsafe property names, invalid ownership, excessive depth/bytes, malformed selectors/IDs, and non-JSON data.
3. Readonly declaration consumer cannot mutate nested inspection/trace results.
4. Bare core SDK imports without DOM, Devframe, MCP, or Playwright.
5. Real pinned Devframe probe proves exact custom tool fields/envelope, principal injection, cancellation, no shared-state leak, targeted browser call, and disposal.

## Implementation steps

1. Capture HEAD/status and affected test baseline without modifying concurrent work. Recheck actual package exports, Node engine, TypeScript/module setup, and MCP SDK peers.
2. Select exact mutually compatible `devframe`, `@devframes/agentic`, and optional hub/add-on versions from installed/package metadata. Do not use a moving latest version or trust page badges. Record peer/engine constraints and source links.
3. Implement portable DTOs/budgets/errors from contracts. Share constants; no Zod/Devframe types in browser core merely for adapter convenience.
4. Add disabled defaults, exact inspection origin allowlist, and top-level descriptor capability/policy extensions. Follow contracts; current readers reject `capabilities.inspection` and `embed.allowInspection`. Prove version-1 extension compatibility or implement negotiated versioning before downstream work, including snapshot publication.
5. Build minimal adapter probes with actual SDK client/transport. Confirm per-request verified principal and abort signal can reach handlers. Record chosen custom registration path for stable Histoire envelope and field names. Probe browser identity and MCP request identity separately: upstream trusted-connection flag is not principal authentication. If upstream custom handlers cannot receive request identity, AbortSignal, or raw MCP error envelope, choose an explicit MCP SDK transport adapter over the same service descriptors, retaining Devframe hosting/discovery. Record this choice before broker/tool implementation.
6. Pin optional dependencies only in adapter/feature-owning package. Verify cold dependency absence and browser import graph.
7. Freeze signatures and ownership; update authoritative contract if real upstream constraints require a deliberate adjustment, including every dependent slice.

## API changes

Portable types, optional source capabilities/config, new error codes, and optional package entry skeleton only. No live instrumentation enabled by default.

## Failure paths

Unsupported upstream transport/auth seam blocks adapter milestones, not shared inspection extraction. Never weaken Histoire auth or migrate native MCP to work around package mismatch. Missing optional peer must affect only activated feature.

## Validation commands

Run protocol tests/build and adapter compatibility/import tests. New adapter scripts are defined here as specified in [validation](validation.md). Record exact package versions and probe outputs.

## Acceptance criteria

Contracts compile, old/new capability matrix is explicit, core import purity holds, and adapter prerequisites have real proof or named blockers. No browser/agent compatibility claim based on typecheck alone.

## Non-goals and handoff

No runtime implementation or endpoint migration. Hand off DTOs, capability mapping, budgets, pinned versions, verified upstream signatures, and remaining compatibility gates to 02/06/07/08.
