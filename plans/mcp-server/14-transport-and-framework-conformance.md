# Slice 14 — Transport, framework, and deployment conformance

## Outcome and prerequisites

Prove combined system using real SDK clients, built CLI, live framework projects, standalone Node deployment, and failure paths. Depends on 06, 07, 09, 10, 11, 12, and 13. Focused unit success alone is insufficient acceptance.

## File ownership

- Add `packages/histoire/src/node/__tests__/mcp/integration/{stdio,http,frameworks,restarts,execution,dependencies}.spec.ts`.
- Add small fixture projects under `packages/histoire/src/node/__tests__/mcp/fixtures/` only when existing examples cannot provide deterministic behavior. Link/reuse shared story content rather than duplicate fixtures across tests.
- Extend one shared project/process/client harness; keep each test source under 300 lines.
- Add package script `test:mcp:integration` with explicit Vitest config/include if browser/process suite needs separation from normal unit suite. Do not accidentally run broad Cypress harness through core Vitest.
- Change implementation files only to fix a demonstrated contract failure; map fix back to owning slice.

## Tests first / matrix

1. Stdio, default dev HTTP, and deployed HTTP with current revision 2026-07-28 and promised legacy 2025-11-25: discover/init, strict schemas, reads/resources, screenshot/test/cancel, process restart/shutdown. Plain dev requires no opt-in or secret; explicit CLI/config disable is tested.
2. Vue 3, Svelte 4, Svelte 5/SvelteKit, and Nuxt 4: story/variant/doc/source discovery; URLs/custom base; one real preview PNG. Browser tests where project owns supported Vitest/Playwright; otherwise verify explicit dependency capability/error instead of installing into user fixture implicitly.
3. Project with no browser dependencies: complete six read tools/resources; screenshot/test calls return actionable dependency failures without package install or browser launch.
4. Standalone Markdown, inline Vue docs, sibling docs, virtual story, mocks/MSW, custom ID, duplicate IDs, docsOnly, no-test, failed-test, broken/uncollected story.
5. Two clients with concurrent distinct targets, dedup retry after lost response, active cancel, restart during queue/start/test/screenshot, and child crash. Exact job/principal/epoch ownership is observable.
6. Host/Origin/auth/body/security matrix and outside-root source rejection. Stdio config logs/direct writes cannot pollute stdout.
7. Cleanup repetition: run start/job/close cycle three times, verify owned child handles exit and ephemeral ports can rebind; compare captured process handles, not global machine process count.
8. Build static and Node from same fixture: static remains unchanged; Node artifact runs from unrelated cwd with source/project node_modules absent. Metadata/docs/source available; screenshots and built-preview tests work with only explicit Playwright/Chromium.
9. Deployment public/private routing, history/hash/custom base, PUBLIC_ORIGIN/proxy-header isolation, required credentials, includeSource:false, missing/tampered manifest, health/readiness, signal drain, and clean port rebind.
10. Node builds without embedded tests and runtime without browser dependencies report precise capabilities/errors. Dev default-port collision fallback and explicit-port failure are distinct cases.

## Implementation steps

1. Launch built package entry from actual temporary consumer cwd. Use official SDK client plus explicit protocol-version support/config to exercise both revisions; no handcrafted JSON lines except checking stdout integrity.
2. Reuse existing example configuration when stable; use local symlinks/workspace dependencies without modifying example package files during tests. Svelte4 example uses older Vite; record supported combination and baseline incompatibility distinctly.
3. Fixture stories must have deterministic semantic assertions, stable IDs, and a finite hanging test for cancellation. Reuse lifecycle/mock story fixtures already present when feasible.
4. Keep browser install separate from dependency-present checks. Integration environment explicitly installs Chromium; negative fixture intentionally cannot resolve browser peers from project. Resolver fallback to Histoire dependency tree must be accounted for when asserting missing packages.
5. Provide cancellation/restart probes with controlled barriers/events rather than arbitrary sleeps. Count public job transitions, summaries, and owned resource close events; do not assert scheduler private implementation.
6. Pin timeout/poll budgets and preserve concise decisive failure diagnostics. Retry infrastructure boot only where existing Vitest optimizer reload logic already allows it; never blindly retry execution effects.
7. Run focused integration suite, then complete validation matrix from validation.md. Record exact source revision, command, environment/dependencies, and observed result. Separate framework baseline failures from MCP regressions with unchanged-baseline reproduction when needed.
8. Update plans/evidence to reflect final behavior. A missing promised matrix row remains unfinished work or explicit reduced scope; do not label it accepted from unit tests.

## Acceptance and validation

All promised transport revisions, default-on dev/explicit-disable, six read tools/four execution tools, standalone Node deployment, private content/auth routing, both test engines, ownership/cancellation/restart, and real Vue/Svelte preview behavior pass. Nuxt/SvelteKit compatibility has explicit live/build/deployed evidence or documented blocking baseline and reduced support claim. No runtime/source dependency changes hidden in fixture setup. Original project unavailable during Node acceptance.

## Non-goals and handoff

No per-client vendor configuration automation, live cloud provisioning, visual pixel snapshots, performance benchmarks, or framework/Vite migration project. Handoff is executable development/deployment conformance suite plus evidence ledger for 15.

## Implemented handoff (2026-10-02)

- Five explicit suites: `integration/{stdio,http,deployment,execution,frameworks}.spec.ts`, with shared `utils/mcp/{process,cli-project,browser-test-project,artifact-project,framework-project,framework-preview}.ts`. Real browser/process proof is excluded from ordinary core Vitest and runs via `test:mcp:integration`; slice15's installed package gate remains separate.
- Final frozen-source integration: **5 files / 25 tests passed in 378.01 seconds**, using Node22 children and official current/legacy SDK clients across stdio/dev/deployed execution. Four framework rows cover live discovery/preview and copied Node builds with original source removed. Mandatory browser capabilities and aggregate cleanup failures prevent silent skips.
- Exact command, framework/dependency versions, deployed privacy/security/dependency cases, cancellation barriers, cleanup, prior harness cache correction and evidence boundaries: [slice14 evidence](evidence.md#slice-14--executable-transport-framework-and-copied-artifact-conformance).
- Tested Svelte4 project Vite5 combination remains outside current Histoire Vite peer range; no broad Vite5 claim. Svelte/Nuxt preview/build/deployment success does not imply browser-test engine parity beyond tested Vue fixture. No framework baseline blocker remains. Cross-slice fault-injection coverage and root aggregate validation remain distinct gates.
