# Validation and acceptance matrix

## Implementation validation (this task)

The slice pack is implemented locally by one agent per slice; local validation gates passed. [Evidence](evidence.md) records actual unit, transport, browser, framework, installed-package, copied-artifact, build, and documentation gates separately. Plans describe contracts and acceptance requirements; their presence does not establish a passing gate. Local commit authorized after validation; remote CI and publication were not performed.

Final local outcomes:

- Workspace build and combined final core build passed; core TypeScript noEmit passed.
- Workspace unit tests passed: **681 tests / 125 files** (671 core, 10 controls).
- Frozen final transport/framework conformance passed: **25 tests / 5 files**, including stdio/dev HTTP/copied Node current and legacy protocols, Vue execution parity, and Svelte 4/Svelte 5/SvelteKit/Nuxt live/build/copied preview PNGs.
- Clean locally packed Node 22 consumer and source-deleted copied Node artifact passed complete **1-test package gate**, including optional-peer absence, reads, PNG resources, both execution engines, static/Node CLI builds and confirmed shutdown.
- Documentation build, frozen-lock check, and `git diff --check` passed.
- Scoped workspace ESLint passed: **0 errors / 35 warnings**. Full lint retains unrelated preexisting `plans/embeddable-sdk/public-api.md:50` error, `ts/method-signature-style`; that file was preserved. Authored slice15 files and final plan updates passed focused lint without errors/warnings.

Framework preview evidence covers tested version combinations, not browser-test parity across all frameworks. Vue fixture evidence establishes both engines' observable outcomes. Local success is not remote CI or release evidence.

## Implementation test policy

Each slice starts with meaningful behavior tests. Reuse existing test helpers/fixtures; one SDK/project/process harness supports all slices. No CSS/class assertions, snapshotting implementation internals, duplicated schemas, or test count targets. Files remain below 300 lines; docs exempt.

Build required packages before tests importing compiled shared/app modules. Existing lifecycle suites can otherwise falsely exercise stale `@histoire/shared` output. Focused tests, full core suite, workspace build, framework browser proof, installed-package proof, CI, and publication are different evidence.

## Acceptance mapping

| Requirement | Slice | Required evidence |
| --- | --- | --- |
| SDK/Node/TS compatibility and server-only imports | 01, 05, 11, 15 | Actual pinned imports/build, production import trace, browser bundle check |
| Startup readiness/partial failure/restart/close | 02 | Unit fault stages plus real repeated dev start/stop |
| Atomic snapshots, no stale successful recollection | 03 | Batch/error/source-only/duplicate-ID tests |
| Markdown change/association/virtual story freshness | 03 | Existing renderer tests plus real watcher edit |
| Source/docs correctness, containment, size/hash/paging | 04 | Temporary file/symlink and Unicode/line tests |
| Six read tools/resources parity | 05 | Official SDK client discovery/calls/reads |
| Raw preview URL correctness/custom base/router mode | 05 | App/server helper parity and real preview navigation |
| Stdio stdout integrity and worker ownership | 06 | Built CLI with noisy config and EOF/crash cleanup |
| HTTP locality/Host/Origin/token/body guard | 07 | Actual sockets and guard-before-dispatch tests |
| MCP enabled by default in dev / explicit disable | 07, 14 | Plain dev usable without token; config/CLI precedence and port collision fallback |
| Exact job identity/retry/cancel/epoch isolation | 08 | Concurrent public operations and late completion tests |
| Real readiness/screenshot/isolation/artifact limits | 09 | Chromium image decode/dimensions, hostile-message guards |
| Shared server-triggered UI/MCP lane and test semantics | 10 | Existing UI fallback/lifecycle suite plus real targeted runner |
| True abort/cleanup, no blind job retry | 08–10 | Controlled active cancel, owned process exit, blocked execution if cleanup unconfirmed |
| Static build unchanged / Node output target | 11, 12, 14 | Original static assets plus Node public/private layout and CLI target precedence |
| Private versioned catalog/docs/source manifest | 11 | Content hashes/schema/allowlist; no credentials/absolute paths; consistent build capture |
| Standalone Node production runtime | 12, 14 | Copied artifact works with project/Vite/Histoire unavailable |
| Deployment auth/routing/origin/private content | 12, 14 | Credential guard, custom base, proxy-header rejection, private-route/traversal tests |
| Production health/drain/owned browser shutdown | 12, 14 | Actual process readiness, signal cancellation, port rebind |
| Compiled deployment test engine | 13, 14 | Real built-preview execution/parity/cancel with no project Vitest Node runner |
| Modern and promised legacy revision support | 14 | Real current/legacy client over each development/deployment transport |
| Vue/Svelte/Nuxt/SvelteKit support | 14 | Framework-specific live/build/deployed evidence, dependencies explicit |
| Optional browser dependencies | 05, 12, 14, 15 | Installed and deployed consumer without peers still reads metadata/content |
| Distributed worker/bin and docs examples | 15 | Local tarball clean-consumer launch, standalone deploy smoke, docs build |

## Commands to run during implementation

Commands below exist in current manifests. Run from repository root unless stated otherwise. Browser/process suites are explicit so ordinary unit tests do not run them twice.

```bash
# Existing workspace/package commands
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm build
pnpm lint
pnpm docs:build

# Focused, transport/browser, and clean installed-package gates
pnpm --filter histoire test src/node/__tests__/mcp
pnpm --filter histoire test:mcp:integration
pnpm --filter histoire test:mcp:package

# Standalone Node build target
pnpm --filter histoire-example-vue3 exec histoire build --target node
# Run copied generated artifact from isolated directory, credentials supplied by environment
node /tmp/histoire-node-artifact/server.mjs

# Existing framework regression commands; keep separate from MCP integration
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
git diff --check
```

`pnpm --filter histoire test src/node/__tests__/mcp` excludes process/browser integration and the installed-package smoke. Dedicated Vitest configs explicitly include them in `test:mcp:integration` and `test:mcp:package`; ordinary package tests never repeat these gates implicitly.

Core compile uses actual TS 5.6 config, not unsupported fictional root `typecheck` script. App/plugin type checks/builds follow their real manifest commands. Source-development browser probes use `HISTOIRE_DEV=true histoire dev` or existing `dev:hst`; plain story:dev uses built app and is not source-dev proof.

## Integration fixture requirements

- Root/cwd/config with spaces; custom base and both router modes.
- Vue normal/mocked story, Svelte story, Nuxt/SvelteKit setup, standalone Markdown, sibling docs, inline Vue docs.
- Exact hostile IDs, duplicate story IDs, duplicate scoped variant IDs, shared variant IDs across stories.
- Tests passing/failing/skipped/no-tests/uncollected, explicit deadline, controlled hang/cancel.
- No optional browser packages and package-present/browser-executable-absent are separate cases.
- Source symlink outside root, changed file during read, oversized line/body/PNG/summary.
- Cold start, HMR/source/Markdown update, rapid config restart, operation admission response loss, child crash, EOF/signal close.
- Plain dev without token, config/CLI disable, default-port collision fallback, optional bearer mode, and stdio worker without duplicate HTTP listener.
- Static vs Node target build, copied artifact with original project/source/dependencies unavailable, private docs/source inventory, includeSource:false, missing/tampered artifact.
- Public-origin/custom-base/proxy routing, required deployment token, health/readiness/drain, compiled-preview test engine, and compiled static mocks/MSW.

## Evidence ledger template

When implementation starts, create evidence.md with entries:

```text
Slice / requirement:
Source revision and local diff scope:
Environment: Node, pnpm, SDK, Vitest, Playwright, Chromium, framework/Vite versions:
Command or automated test:
Observed result:
Baseline/environment failures and reproductions:
Unverified boundaries:
Artifacts or logs (bounded, no credentials):
```

No CI run or release evidence should appear until actually performed. Do not infer broad acceptance from one green framework, command, transport, or test subset.

## Stop conditions

- Unsupported SDK/TS/Node combination: preserve other work; fix isolated compatibility or record blocked dependency before building transport on it.
- Unconfirmed browser teardown: disable execution for current process; metadata remains usable. No success claim from timer expiry alone.
- Framework baseline incompatible: prove unchanged baseline, record it, and avoid unrelated migration; advertised support cannot exceed observed support.
- Any mismatch between contracts and implementation: resolve schema/docs/test/code together before accepting slice.
- Concurrent work in same source files: inspect current diff and integrate safely; never revert unrelated changes.
- Node deployment depends on original config/Vite/source/project node_modules, exposes private manifest through static fallback, or starts without required production credential: deployment gate failed; fix before accepting.
