# 04 — Public Node inspection and existing MCP parity

## Outcome and prerequisites

Depends on: 02. Expose completed isolated inspection in `histoire/node`; keep native MCP wire contract unchanged.

## Owned files

- New `packages/histoire/src/node/api/inspection/{index,input,source}.ts`; extend `api/{types,project,index}.ts` with small collaborators.
- Shared `node/runtime/inspection/` task inputs/source capture from 02, reusing `api/{capture,execution}.ts` patterns.
- Existing MCP inspection executors/server wrappers only where needed for shared service parity.
- Node SDK `embed/node-inspection.spec.ts`; MCP schema/inspection/operation integration tests.

## Tests first

1. Explicit `source: 'dev' | 'preview'` chooses exact ready source while both exist; unavailable chosen source never falls back.
2. Invalid input rejects before browser acquisition; abort before admission, queued cancellation, running cancellation, restart and close all drain correctly.
3. Completed Node result and retained MCP result share content for same inputs, allowing only documented transport metadata differences.
4. Legacy MCP tool names/schemas/annotations/resources/errors remain identical. Ordinary screenshot defaults remain 480×320; new inspection defaults 1280×800.
5. Copied Node artifact inspection works without project source, and no MCP dependency is required merely to call public Node API beyond existing package dependencies.

## Implementation steps

1. Validate exact target, explicit source, optional expected revision, selector/bounds/settings, and signal before lane acquisition.
2. Capture source generation/catalog/host/target synchronously. Use existing source-owned execution service, nonce host, and browser task.
3. Return readonly completed result with isolated identity/time; do not expose retained operation IDs or controller objects.
4. Implement `variant`, `dom`, `aria`, and `diagnostics`; reserve capability for axe `accessibility` until 10.
5. Native MCP adapters continue admitting queued operations with principal/key retention and map shared result into unchanged schema. Do not add live session discovery here.
6. Preserve cleanup quarantine and idempotent close; centralize source acquisition only if existing capture service can share it without changing selection/default behavior.

## API changes

`project.inspect` methods from contracts; public inspection capability on appropriate hosting snapshot/handle without inferring availability from installed browser alone.

## Failure paths

No automatic retries after expired MCP operations, SDK cancellation, or stale source. `CAPABILITY_UNAVAILABLE` for missing configured source; typed browser/dependency failures. Cleanup failure prevents later execution until owned recovery.

## Validation commands

Node focused tests, native MCP inspection and transport integration, packed Node artifact test, affected package builds and scoped lint.

## Acceptance criteria

Public Node caller performs same isolated inspection as MCP through shared service. Legacy snapshots/transports pass; both-source and teardown tests pass.

## Non-goals and handoff

No native MCP migration, live tool additions, browser installation, or caller server ownership changes. Hand off public Node API to 08/10/12/14.
