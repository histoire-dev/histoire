# Slice 15 — Documentation, package/deploy smoke, and delivery gates

## Outcome and prerequisites

Users can use default dev MCP and build/run standalone Node deployment with accurate dependency/auth/cancellation guidance; package includes all entrypoints. Depends on 14. This slice prepares release; no commit/push/publish authorized by plans alone.

## File ownership

- Add `docs/guide/mcp.md`, `docs/reference/mcp.md`, and `docs/guide/deploy-node.md`; update deployment/build target and MCP options in `docs/reference/config.md`.
- Modify `docs/.vitepress/config.js` navigation and relevant concise link in root `README.md`.
- Modify `packages/histoire/package.json` only for final integration/package-smoke scripts.
- Add `packages/histoire/src/node/__tests__/mcp/package-smoke.spec.ts` or reusable external smoke script under `packages/histoire/scripts/` when package install process cannot safely run in unit suite.
- Modify `.github/workflows/test.yml` with explicit MCP integration/Chromium step when not already covered. Reuse existing Node/pnpm/cache/build workflow; no unrelated workflow cleanup.
- Add implementation evidence under `plans/mcp-server/evidence.md` only when implementation occurs.

## Tests first

1. Package smoke fails until compiled worker/MCP files are included and built CLI launches from unrelated consumer cwd.
2. Generic documented stdio configuration is parsed and launched by smoke harness; HTTP example URL/flags/header placeholders match actual listener behavior.
3. Consumer without optional browser peers imports/starts read-access workflow successfully. No source/test fixtures or MCP SDK dependencies enter browser bundle.
4. Integration script runs promised transport/browser suite in CI rather than silently skipping it; docs build resolves new guide/reference links.
5. Documented Node build/start workflow runs copied artifact without original project/Vite; static build remains unchanged. Runtime environment/credentials/base/health/cleanup examples match production server.

## Documentation content

1. Primary plain histoire dev workflow with default MCP, actual printed endpoint, --no-mcp/config disable and CLI override. Include stdio alternative with absolute command/root paths and generic client configuration; no repository-only TS launch example.
2. Dev separate ports, loopback access without extra setup, optional bearer token, default-port fallback vs explicit collision. Node deployed endpoint uses same production book port/base and required bearer secret. Show placeholders, never actual tokens; no OAuth provider/browser CORS claims.
3. Six read tools and four execution tools, target IDs, pagination, docs precedence, raw vs virtual source, project revisions, operation polling/cancel, retry requestKey, artifact/result expiry, and tests summary behavior.
4. Browser peers/Chromium installation as explicit user setup, missing-dependency errors, no-test/failed-test/uncollected distinctions, and supported Vue/Svelte/Nuxt matrix from actual evidence.
5. Supported protocol revisions and SDK version; modern stateless HTTP and legacy compatibility. No implied subscription/task-extension support.
6. Limits and troubleshooting: invalid IDs, stale revision, source outside root, stdout pollution, worker startup failure, cancellation still cleaning, and execution unavailable after unconfirmed teardown.
7. Node build target/config, generated public/private layout, node server.mjs/npm start, HOST/PORT/PUBLIC_ORIGIN/HISTOIRE_MCP_TOKEN, includeSource, proxy TLS/Host setup, health/readiness, process signal shutdown, and single-process operation affinity. Explain immutable compiled artifact needs no original project/config/Vite and no runtime collection.
8. Explain dev project-vitest vs deployed built-preview engine, optional Playwright/Chromium, missing embedded runtime, and tested observable parity. Explicit scope exclusions: file edits, arbitrary shell/browser scripts, static-host-only MCP, SSR, and project-wide tests.

## Package and CI steps

1. Produce local `pnpm pack` tarball into owned temporary directory. Inspect contents for compiled worker/runtime/MCP modules and declaration files; no fixture/source-test code or secrets.
2. Install tarball into temporary consumer with necessary Histoire workspace packages resolved through locally packed dependencies. Ordinary `pnpm pack` does not publish. Shared helper handles workspace dependency version replacement without modifying source manifests.
3. Verify clean Node 22 ESM import and built bin `histoire mcp` launch from unrelated cwd. Current wildcard export map must not be sole evidence worker path is present. Read source, run HTTP client, capture screenshot, and execute one fixture test from installed package.
4. Verify consumer without optional peers still starts six read tools. Confirm SDK modules absent from app/browser bundles and regular dev/build still work.
5. CI invokes focused MCP unit suite through ordinary core tests, explicit integration script after workspace build, and one Chromium install in relevant package environment. No integration silently skipped in CI when promised dependencies exist.
6. Run docs build and validate examples/reference links. No tests asserting prose wording; parse/launch documented configuration examples in package smoke where practical.
   Node deployment smoke copies build output into isolated directory/container with only Node and optional Playwright, then reads resources, captures PNG, runs compiled tests, probes private-route rejection/auth/health, and sends graceful shutdown. Do not let monorepo dependency fallback mask missing deployment packages.
7. Run complete required gates once final changes land. Record baseline failures separately and reproduce on unchanged code when attribution uncertain. Do not repeat passing checks without new changes/failures.
8. Review code/tests for duplication, dead placeholders, unused capability flags, unsafe broad cleanup, unhandled promises, and >300-line source modules. Remove unnecessary tests/wrappers.
9. Record validation evidence and known limitations. If user later authorizes commit, semantic commits may follow slice boundaries; never stage beforehand. Publication requires separate explicit instruction.

## Acceptance

Docs reflect tested behavior, local tarball works from clean consumer, all required matrix gates have evidence, no unrelated changes are reverted/staged, and final status distinguishes local tests from CI/publication. A release-ready claim requires terminal CI for exact authorized pushed SHA; local implementation alone is not CI evidence.

## Non-goals and handoff

No live account/client settings edits, plugin installation, global CLI install, release/version bump, commit, push, or npm publish. Final implementation handoff lists supported workflows, exact validation, package smoke, and any unresolved gate.

## Implementation and local evidence — 2026-10-02

- Added MCP guide/reference and Node deployment guide, config reference, navigation, and root README links. Docs describe default dev HTTP, compiled stdio, credentials, six reads, operations/resources, limits, both test engines, framework versions, portable artifacts, source visibility, and proxy/health/shutdown behavior.
- Main package now explicitly includes compiled outputs/declarations/entrypoints, excludes physical source/tests/fixtures, and declares Node >=22. Dedicated package-smoke config keeps clean installation/browser deployment proof outside ordinary unit tests. CI explicitly installs Chromium and runs `test:mcp:integration` after workspace build; this is configured CI coverage, not an executed CI result.
- Actual local command: `flock -s /tmp/histoire-mcp-build.lock env HISTOIRE_MCP_TEST_NODE=/usr/bin/node BROWSER=none pnpm --filter histoire test:mcp:package`: **1 file / 1 complete gate passed**, 54.85 seconds. Six workspace packages were packed locally into owned temporary tarballs, installed without modifying source manifests, and imported/launched with Node 22.23.1 from an unrelated cwd. Optional Playwright/Vitest/browser-provider absence was independently resolved with `NODE_PATH`/`NODE_OPTIONS` removed.
- Installed compiled stdio and dev HTTP serve all six reads plus exact raw docs/source resources. Missing optional browser peers preserve read access and return actionable dependency failure. Explicit peers enable a real 1280×800 PNG with independently checked dimensions/bytes/hash and project-Vitest summary **3 passed / 1 skipped**. Installed CLI successfully builds existing static output and Node output.
- Copied Node artifact runs after original consumer/source/project `node_modules` deletion. Node-only server passes reads, browser document navigation, bearer auth, private-route rejection, health/readiness, graceful exit and port release. Installing only its generated optional Playwright dependency enables another independently verified PNG and built-preview summary **3 passed / 1 skipped**; Vite, Vitest, Histoire and browser provider remain absent. Installed app/static browser output contains no MCP SDK/Node transport import markers.
- Real clean installation exposed two runtime dependency bugs. Preview preamble now resolves vendor entries through existing Histoire-owned resolver, preventing consumer virtual-module import failure. Vitest browser dependency optimization excludes Node Playwright provider packages, preventing optional Chromium BiDi resolution failure. Failed-first focused regressions plus actual installed browser execution establish both fixes; no extra consumer vendor/runtime dependencies mask them.
- Final combined core TypeScript build passed under exclusive build lock. `pnpm docs:build` passed with VitePress 1.5.0; existing Browserslist/Tailwind warnings remain. Scoped authored-file ESLint passed with zero errors/warnings; `git diff --check` passed. Root owns aggregate workspace checks; slice 14 owns final transport/framework conformance. See shared evidence ledger for final gate status.
- No visible browser opened; all browser proof is headless with `BROWSER=none` and fixture `server.open:false`. Temporary package resources close sequentially through shared `closeMcpFixtures`; successful runtimes confirm owned PID absence and port rebind. Local pack/install does not publish. No staging, commit, push, live cloud deployment, or CI execution performed.
