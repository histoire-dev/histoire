# Slice 01 — Contracts, dependencies, and shared harness

## Outcome and prerequisites

Define one server-only contract layer and prove official SDK v2 can compile in Histoire. Depends on no implementation slice. Read [contracts](contracts.md) and [architecture](architecture.md) first. This is foundation work, not a listening server.

## File ownership

- Modify `packages/histoire/package.json`, `pnpm-lock.yaml`, and, only if required by SDK export resolution, `packages/histoire/tsconfig.json`.
- Add `packages/histoire/src/node/mcp/protocol/{ids,limits,project-schema,story-schema,content-schema,operation-schema,tool-schema,errors,results,uris}.ts`.
- Add `packages/histoire/src/node/__tests__/mcp/{contracts,uris,sdk-imports}.spec.ts`.
- Add shared test helpers under `packages/histoire/src/node/__tests__/utils/mcp/`: `project.ts`, `client.ts`, `operations.ts`, `process.ts`. Only create a helper when a test actually needs it; later slices extend these files.
- Do not change `@histoire/shared` types or app exports for executable MCP code.

## Tests first

1. Test hostile IDs round-trip as exact strings through tool schemas and resource URIs: quotes, slashes, spaces, Unicode, percent signs, `?`, `#`, dot-only IDs, and same variant ID in two stories. Reuse `HOSTILE_STORY_ID` from existing preview fixture instead of copying it.
2. Verify strict rejection of unknown fields, raw args, arbitrary URL/path fields, NaN/fractional limits, duplicate URI query keys, noncanonical/invalid percent sequences, and foreign project IDs. Literal percent-sequence IDs (for example `%2F`) remain legal; canonical encoding and exactly one decode distinguish them from slash IDs.
3. Verify result adapter emits matching structured/text JSON and resource errors remain protocol errors. Test one success and representative domain failure, not every schema property twice.
4. Compile/import minimal SDK factory, stdio entry, Node HTTP adapter, and test client under actual package TS settings. This is useful because deep subpath exports differ from current compiler resolution.

## Implementation steps

1. Check published stable SDK v2 versions with package-manager metadata. Select compatible stable server/node/client versions and Zod 4; record exact resolved versions in validation evidence. No prerelease or v1 fallback. Source repository reported server 2.2.0 during planning; this is not proof of registry availability.
2. Add server/node/Zod runtime dependencies and client dev dependency to `histoire` only. Retain Node >=22 and existing Vitest version. Do not add SDK to vendors/browser packages.
3. Prefer existing ESM compiler setup. If SDK subpath exports require change, use `moduleResolution: bundler` with current `module: ESNext`, then validate whole core build and package consumers. Do not bump TypeScript or switch all packages to NodeNext without evidence.
4. Build strict Zod schemas grouped by domain. Infer DTO types from schemas where practical. Reuse `HistoireTestRunSummary` at result boundary; sanitize/project it separately rather than duplicate runtime test model.
5. Implement a single envelope/error adapter, explicit error-code union, byte-size limits, and canonical resource URI encoder/decoder.
6. Keep pagination cursor serialization separate from resource URI encoding. Cursor decoder validates schema and captured project/revision; base64 is encoding, not authorization.
7. Export only from internal MCP protocol barrel, if useful; no new public package API yet.
8. Add harness helpers around real SDK client, temporary project roots, bounded process close, and operation polling. Reuse existing flush/config helpers; no fake entire Histoire runtime.

## Acceptance and validation

Run `pnpm --filter histoire test src/node/__tests__/mcp/contracts.spec.ts src/node/__tests__/mcp/uris.spec.ts src/node/__tests__/mcp/sdk-imports.spec.ts`, `pnpm --filter histoire build`, and focused ESLint on added files. With a compiler-resolution change, also run existing core suite and workspace build before accepting slice. All executable SDK imports remain under Node-only MCP modules.

## Non-goals and handoff

No CLI flags, project startup, browser launch, SDK transport handshake, source edits through MCP, or package publication. Handoff includes versions, compiler compatibility evidence, exported schemas/adapters, and shared harness paths. Later slices must not create duplicate schemas.

## Implementation evidence — 2026-10-02

- Registry verified and exact pinned: `@modelcontextprotocol/server@2.2.0`, `@modelcontextprotocol/node@2.1.0`, `@modelcontextprotocol/client@2.2.0`, `zod@4.6.5`.
- Published SDK imports compile using unchanged TypeScript 5.6.3 / `moduleResolution: node` settings, including server root, server/stdio, Node adapter, client, and shared output schemas. No compiler option change required.
- Focused contract/URI/SDK suites pass 23 tests on Node 22.23.1 and Node 24.21.0. SDK proof performs a real client tool discovery/call through `serveStdio` using official in-memory transport; no sockets or project/browser startup.
- Actual SDK v2 exports `ProtocolError`, not v1 `McpError`. Missing resources use `ResourceNotFoundError(uri, message)` with current code `-32602`; other resource domain failures use `ProtocolError`.
- Reusable SDK client harness lives in `src/node/__tests__/utils/mcp/client.ts`; other helpers are deferred until consumers need them. Cursor serialization lives in `mcp/protocol/cursors.ts`, separate from URI encoding and catalog retention.
- Lockfile preserves previous package resolutions; frozen offline lockfile validation succeeds. Core `tsc --noEmit` passes current tree. Full workspace/build/integration gates remain owned by later slices and root integration.
