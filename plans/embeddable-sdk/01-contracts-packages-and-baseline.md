# 01 — Contracts, packages, and baseline

## Outcome and prerequisites

Depends on: none.

Establish portable contracts, package boundaries, and trustworthy test baseline before runtime refactoring. Read [public API](public-api.md), [architecture](architecture.md), [coordination](coordination.md), and [validation](validation.md). Contract definitions live in public-api.md; this slice translates them into exported types and validators.

## Owned files

- Add packages/histoire-protocol/{package.json,tsconfig.json,src/index.ts,src/types/*,src/bridge/*,src/serialization/*,src/url/*}.
- Add packages/histoire-sdk/{package.json,tsconfig.json,src/index.ts,src/internal.ts,src/types.ts} and packages/histoire-vue/{package.json,tsconfig.json,src/index.ts}. Create build/test scripts and declaration output; unimplemented methods must not masquerade as working APIs.
- Move portable definitions from packages/histoire-shared/src/types/preview-message.ts and related serializable test types. Preserve shared compatibility exports and existing import names.
- Reuse shared serialization/preview URL helpers; separate Vue ref unwrapping from portable reconciliation. Do not add a second serializer.
- Add protocol src/bridge/{limits,size}.ts as single portable implementation of [wire size and traversal limits](public-api.md#wire-size-and-traversal-limits); no Node Buffer dependency or JSON.stringify for cyclic state.
- Repair packages/histoire/src/node/__tests__/utils/run-tests-harness.ts; retain dedicated browser dependency-preflight tests.
- Add protocol contract tests, SDK import tests, and one shared transport fixture module. Core project/browser fixture helpers belong under packages/histoire/src/node/__tests__/utils/embed/ and are consumed by later integration suites.
- Update workspace dependency manifests/lockfile only where new packages require them.

## Tests first

1. Import built protocol/SDK in a process without window/document. Assert no Vue, Vite, Node built-ins, app, or MCP dependencies enter portable browser graph. Check declarations as well as JavaScript.
2. Exercise valid bridge envelopes and reject unknown commands, invalid origins, wrong versions, mismatched identities, malformed state/settings, and oversized error details.
3. Preserve exact IDs containing colons or separator-like characters using structured tuple lookup. Prove shared compatibility exports refer to same contracts/helpers.
4. Test portable state reconciliation against omitted callbacks/non-serializable fields using existing fixtures, not duplicate object builders.
5. Reproduce temporary-root preflight failure, then scope browser-preflight mock to run harness. Dedicated real dependency tests must still reject genuinely missing project dependencies.
6. Size-accounting tests: cyclic/aliased state and existing undefined/BigInt leaves preserved; oversized/deep/wide/sparse graphs stop within traversal bounds; huge BigInt fails before representation allocation; getters/toJSON never execute; Unicode/escaped JSON bytes counted correctly; catalog-specific limit overrides generic response limit. JSON DTOs still reject state-only primitives. Reuse one graph fixture builder rather than duplicate serializer fixtures.

## Implementation steps

1. Refresh baseline and record exact failures separately from package work. Historical baseline is 371 passing/20 failing across three suites; see validation.md.
2. Create ESM build/export maps with types and explicit entry points. Export protocol without platform effects. SDK depends on protocol only for runtime; Vue package uses host Vue peer and SDK/protocol.
3. Move wire-safe DTOs, identity/envelope types, capability/error definitions, validators, and genuinely shared helpers once. Implement bounded iterative accounting and command/stream limit selection from public-api.md; preserve existing state serializer. Leave callback, DOM, framework instance, and Node service types at their execution boundary.
4. Keep existing sandbox protocol wire fields compatible. New external bridge envelopes are adapters around shared runtime contracts, not replacement competing protocol.
5. Add unsupported first-party SDK internal entry without importing Histoire app. Public entry must never import internal platform adapters eagerly.
6. Reserve controls peer-build ownership for slice 09; do not switch existing controls consumer runtime here.
7. Consolidate reusable test helpers. Tests consume built dependencies in topological order; avoid assertions that only mirror type declarations.
8. Add JSDoc to all exported contracts/properties and ownership helpers. Split authored source/test modules below 300 lines.

## API changes

Introduce package/type/export surface defined in [public-api.md](public-api.md). Existing @histoire/shared names remain available through compatibility exports. Wire test summaries cannot contain callbacks, DOM nodes, or Errors with uncontrolled properties.

## Failure paths

Import-time DOM access, transitive Node/framework imports, incompatible shared exports, validator accepting unbound traffic, and hidden fallback serializers block this slice. Unsupported skeleton functionality must fail explicitly or remain unexported until implemented. Harness mock cannot disable real dependency preflight outside its fixture scope.

## Validation commands

Create new package scripts before running:

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/protocol test
pnpm --filter @histoire/shared build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/sdk test
pnpm --filter histoire test
pnpm run lint
~~~

Record before/after core suite counts. Do not describe full suite as green while any baseline failures remain.

## Acceptance criteria

- Built portable imports and declarations work without browser globals or runtime/framework dependencies.
- One set of validators/serialization helpers serves old shared consumers and new packages.
- Harness resolution failures repaired with real dependency checks retained.
- Package graph acyclic; scripts usable by later slices; no advertised working runtime from skeleton alone.

## Non-goals

Session behavior, source transport, Vue rendering, controls peer build, server lifecycle, protocol version negotiation implementation (slice 07, contract in public-api.md), and publishing.

## Handoff

Provide actual export paths, validator/fixture entry points, dependency graph, compatibility tests, and refreshed baseline evidence. Slice 02 consumes Node/shared contracts; slice 05 consumes controller/transport types. All future wire/API changes update public-api.md first.
