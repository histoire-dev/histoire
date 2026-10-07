# 14 — Package consumers, examples, and documentation

## Outcome and prerequisites

Depends on: 12, 13. Prove public package boundaries and document complete workflows with installable examples.

## Owned files

- Adapter exports/build/dependency declarations and scoped workspace lockfile updates.
- Extend `examples/embed-vanilla`, `examples/embed-vue`, `examples/embed-node`; add dedicated Devframe host example only if existing examples cannot keep optional paths clear.
- New `docs/guide/devframe.md`, `docs/reference/inspection.md`; extend SDK, Node SDK, MCP, embedding references and `docs/.vitepress/config.js` navigation.
- Packed consumer tests reuse `node/__tests__/utils/package-consumer.ts` and embed consumer infrastructure.

## Tests first

1. Packed vanilla host imports public SDK, opts into live reads, and works without Devframe installed.
2. Packed Vue host composes new panels with peer Vue and cross-origin book; no internal aliases.
3. Packed Node host uses public isolated API and optional adapter on owned HTTP server; neither closes caller resources.
4. Missing optional agentic/axe packages affect activated features only; build graph contains no server packages in browser output.
5. Copied static book/report and Node artifact work away from repo paths.

## Implementation steps

1. Publish separate `/client`, `/node`, `/types` exports with correct declarations and side-effect flags. Browser bundling cannot resolve server entry accidentally.
2. Wire scripts from slice 01 and include only intended dist files. Set tested dependency/peer ranges; document engine and optional installation matrix.
3. Vanilla example: live state edit, DOM inspection, detach cleanup. Vue example: picker/tree/trace/audit with unavailable-feature handling. Node example: explicit isolated source selection plus host-mounted adapter.
4. Include authenticated grant/bootstrap example with host-owned principal; no token in URL or hardcoded committed credential. Show exact session discovery before live MCP call.
5. Document current native isolated MCP and new live endpoint separately, including live user state, cancellation, fresh source defaults, unsupported capabilities, static mode, WebMCP status, and scope limits.
6. Include minimal setup for Vite/Nuxt dock and report export with verified versions. Every code sample must typecheck/run against packed outputs.

## API changes

Final public exports/examples for all accepted slices; no new behavior invented in documentation.

## Failure paths

Packed test failure is packaging failure even if workspace source aliases work. Optional feature unavailable must show typed recovery, not hidden dependency install or fallback.

## Validation commands

Package builds and tarball consumer suite, existing `test:embed:consumers` and `test:mcp:package`, docs build, browser import graph audit, scoped lint.

## Acceptance criteria

Clean external consumers reproduce advertised workflows; docs distinguish supported and experimental/unverified paths; no private imports required.

## Non-goals and handoff

No npm publication, remote hosting, commit/push, or unrelated example modernization. Hand off package list, exact install commands, conformance matrix, and limitations to 15.
