# Validation and acceptance

Status: planned. Commands below are future implementation checks, not runs performed while writing plans. Build required dependencies before package tests; use existing workspace runtime tooling. Permission/environment failures must be reported separately from product failures.

## Check layers

1. Protocol unit tests: strict inputs, immutable outputs, work/byte limits, getter avoidance, target ownership, old descriptor compatibility.
2. SDK unit tests: exact capture before await, cancellation, disposed/reentrant lifecycle, non-selected grid cell, no implicit runtime, optional dependencies absent.
3. Real browser tests: same/cross origin, fresh/live distinction, unsaved state, DOM geometry, actual Vue ownership, runtime replacement during requests, iframe-scoped axe.
4. Server/transport integration: paired browsers, multiple principals/projects, stdio/HTTP isolated parity, live Devframe HTTP/discovery, revocation, middleware ownership.
5. Packed consumer tests: installed tarballs outside workspace with no workspace aliases, browser import purity, server middleware, built/static behavior.
6. Final UI inspection: keyboard focus, selection, highlight, source navigation, error/empty states. Screenshots demonstrate rendering only, not full usability/accessibility.

## Acceptance matrix

| Scenario | Required evidence | Slice |
| --- | --- | --- |
| Read unsaved state without remounting | Browser mutation, SDK read, MCP read all refer to same document | 03, 08 |
| Fresh isolated read remains independent | Live edit absent from separate fresh mount; both modes labeled | 04, 08 |
| Getter-safe state and component details | Getter counters remain zero; cycles/refs/metadata bounded | 02, 09 |
| Grid exact target | Inspect non-selected mounted cell; reject unmounted virtual cell | 03 |
| Replacement during request | Old promise rejects; no new document result or highlight | 03, 07 |
| Two tabs, sessions, projects | Explicit IDs route exactly; no broadcast command execution | 07, 08 |
| Principal isolation | Separate verified browser and MCP identities; unauthorized listing/resources/call/trace denied | 07, 08 |
| Lease and page bounds | Late heartbeat cannot revive lease; byte-limited pages preserve every authorized item | 07, 08 |
| Capability withdrawal | HMR/config/origin policy change revokes before next call | 03, 07 |
| Cross-origin SDK host | Allowed authenticated bridge succeeds; unlisted origin denied | 03, 14 |
| Missing Devframe/agentic/axe | Core works; activated unavailable feature returns typed failure | 01, 10, 14 |
| Existing MCP compatibility | Existing tool/resource fixtures and real transports pass | 04, 15 |
| Diagnostics ownership | Console restored, double attachment safe, no stale subscribers | 05 |
| Vue ownership | Fragments/Teleport/slots/async/KeepAlive handled or explicitly partial | 09 |
| Accessibility scope | Broken story found; identical broken shell excluded | 10 |
| Middleware lifecycle | Host HTTP routes/WebSockets survive adapter restart/disposal | 12 |
| Static report | Offline reads work, historical label present, no live actions/secrets | 12 |
| WebMCP unavailable | No registration; ordinary SDK and node MCP unaffected | 13 |
| Packed native/iframe consumers | Vue host and vanilla host use public imports only | 14 |

## Commands

Existing scripts verified in package manifests:

```bash
pnpm --filter @histoire/protocol test
pnpm --filter @histoire/sdk test
pnpm --filter @histoire/vue test
pnpm --filter histoire test
pnpm --filter histoire test:embed:integration
pnpm --filter histoire test:embed:consumers
pnpm --filter histoire test:mcp:integration
pnpm --filter histoire test:mcp:package
pnpm run build
pnpm run docs:build
git diff --check
```

Slice 01 creates `@histoire/devframe` scripts `build`, `test`, `test:integration`, and `test:consumers`. New script names are deliverables, not existing runnable commands. Scope ordinary tests by file while iterating; broaden once after integration. Run scoped ESLint on changed source/test files and report unrelated baseline failures separately. Do not fix broad unrelated lint noise.

## Performance and loss behavior

Use deterministic bounded probes, not open-ended benchmarks. Fixtures: 1000-node DOM, 500-component tree, 1 MiB+ state with hostile getters, and 2000 diagnostic entries. Verify traversal stops at limits, response JSON fits budget including long identities, and loss counters/cursors remain correct. Timings are observations; avoid fragile single-run wall-time assertions. Capture idle overhead with feature disabled and after disposing attachment; prove no retained polling/observer subscriptions. A cancellation test must verify resource release as well as rejected promise.

## Package/import verification

- Import base SDK under Node with no `window` and without Devframe installed.
- Bundle browser SDK and adapter client independently; inspect module graph for Node, MCP, Playwright, Vite, and server Devframe entries.
- Install adapter without optional agentic/a11y packages and exercise read-only local attachment where supported.
- Install complete adapter and test actual HTTP MCP client/discovery process, not mocked handler only.
- Pack Node output, copy away from repo, exercise isolated inspection plus opt-in adapter hosting.
- Keep external browser/book origins distinct in integration; same-origin localhost alone does not prove cross-origin support.

## Completion gate

All required scenarios pass on final changed tree; regressions resolved or explicitly block their milestone. Record exact commands, commit plus dirty diff identity, dependency versions, browser version, URLs/modes, and outputs. Separate local completion from remote CI/package publication. Do not commit, push, install global tools, or deploy merely to fill evidence cells.
