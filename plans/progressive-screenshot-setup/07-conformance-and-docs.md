# 07 — Consumer proof and documentation

Prerequisites: [05](05-check-and-repair.md), [06](06-node-deployment.md). Completes M3; progressive setup can ship without slice 08.

## User outcome

Documented progressive setup works in fresh consumers, beyond monorepo's preinstalled browser cache. Every terminal installation suggestion corresponds to observed missing capability.

## Owned files

- `docs/guide/{ui-screenshots-mcp,mcp,deploy-node,testing}.md`
- Config reference location discovered through `rg` for existing browser/test config docs; do not create duplicate config reference.
- Existing MCP package/consumer/integration suites and shared CLI/capture project helpers.
- New dated acceptance receipt under `plans/progressive-screenshot-setup/`.

Any implementation repair belongs to the slice owning that module. Do not perform unrelated UI/test-tree changes present in baseline.

## Documentation requirements

1. Explain automatic candidate order and explicit choice, including renderer-version differences and stable pinned choice for reproducibility.
2. Lead with “Check existing setup”; show driver-only installation if user already has Chrome/Edge, then shell-only installation if no browser works.
3. Explain Linux system dependencies and full renderer as targeted separate repairs. Full install must include correct source config; installing full browser cannot make default shell launcher use it.
4. Document core-only opt-in and selected-driver CLI name; no claim it eliminates automation/browser dependency.
5. Keep development Vitest install guide accurate and distinct. Do not suggest screenshot core setup enables development tests.
6. Document CLI metadata vs explicit check, JSON exit behavior, refresh after installation, and no automatic installs.
7. Document Node artifact environment overrides and target-machine discovery, without implying static builds have screenshot service.
8. Preserve UI feature restrictions: dev screenshots only; static book hides setup UI; Node execution uses existing SDK/MCP routes.

## Real consumer proof

Use temporary consumers outside repository, packed Histoire artifacts, and isolated browser cache paths. Reuse existing consumer builders; do not create new project generators or duplicate fixtures.

Run bounded proofs from [validation matrix](validation.md):

- Driverless + installed Chrome: exact driver-only repair; after explicitly scoped install, capture succeeds without browser download.
- Playwright + matching shell-only cache: capture through UI, SDK, HTTP MCP, stdio MCP; exact DPR/transparency/matrix props proof.
- Playwright/core + branded browser only: screenshot/inspection succeed; development tests still accurately unavailable without required peers.
- Matching full cached browser only: no shell/full download.
- Empty cache/no branded browser: shell action; after scoped shell-only install, successful capture and no full browser required.
- Supported Linux image missing libraries: classified OS dependency repair, then successful capture after image-level install.
- Explicit choices never fallback; story failures never select another renderer.
- Copied Node artifact honors target overrides and launches no build-machine path.

OS-specific known-location support requires at least one real smoke per advertised OS. If Windows/macOS jobs are unavailable, report those gates pending; do not imply fixtures establish support. Guard expensive matrix jobs so each core setup transition is proved once, not repeated across every transport unnecessarily.

## Quality review

- Read all shared setup modules together. Remove repeated candidate inventories, classifiers, command specs, DTO serializers, and process cleanup helpers.
- Review tests for meaningful behavioral failures, including a deliberate failure injection proving no story fallback and no cleanup bypass.
- Keep source/test files under 300 lines where practical; split by discovery/acquisition/report responsibilities, not arbitrary file length.
- Review optional dependency manifests and built package contents for accidental playwright hard dependency or fallback to monorepo packages.
- Validate public API docs/config snippets against actual exports and supported version behavior.
- Audit UI copy, loading/empty states, request budgets, stdout JSON, path redaction, and cancellation ownership.

## Acceptance

All mandatory core consumer scenarios pass; unsupported/unavailable OS evidence is explicit and advertised support matches proof. Existing MCP schemas/results and screenshot fidelity retained. Source-only unit tests are insufficient for M3.

## Final receipt

Record per-slice status, commands/results, exact package/browser versions, installation mutations confined to acceptance environment, consumer artifacts, unresolved baseline issues, and optional slice 08 status. No browser reuse/performance claim until 08 is independently accepted. No commit/push unless requested.
