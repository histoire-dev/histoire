# Validation and acceptance

These are **planned checks**. Creating this plan pack does not run or pass implementation tests.

## Evidence levels

- Source inventory proves named consumers and deletion scope.
- Focused behavior tests prove changed URL/event/ownership contracts.
- Typechecks prove referenced source graphs compile.
- Fresh builds prove runtime modules/assets emit and generated imports resolve.
- Package/embedded consumer tests prove supported entries work outside first-party source aliases.
- Browser checks prove stated interactions in tested mode/framework.

Do not substitute one level for another or borrow historical redesign results.

## Baseline and execution

At slice 01 record current status/HEAD and focused baseline. During each slice run relevant focused tests; once integrated, run full affected package suites and all three app typechecks. Run final builds before built-output/consumer checks. If source changes afterward, rerun affected gates.

Use existing package scripts and test runner configuration. Resolve current paths before invoking a named suite: some legacy suites will be removed or migrated by earlier slices. No duplicate test harnesses, snapshot/class/style assertions, arbitrary retries or timeout inflation.

## Commands

Repository root, package checks:

```sh
pnpm --filter histoire test --maxWorkers=2
pnpm --filter @histoire/vue test --maxWorkers=2
pnpm --filter @histoire/sdk test --maxWorkers=2
pnpm --filter @histoire/protocol test --maxWorkers=2
pnpm --filter @histoire/controls test --maxWorkers=2

pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/tsconfig.json
pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/tsconfig.workbench.json
pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/tsconfig.embed.json

pnpm run build
pnpm run lint
pnpm run docs:build
```

`pnpm run build` performs dependency-aware workspace builds. Run once at integrated build gate; do not rebuild everything for every leaf deletion. If running only affected packages, inspect current dependency scripts and include shared/protocol/SDK/controls/Vue/app/core/framework dependencies before compiled consumer tests. No ad-hoc broad dist removal.

Focused examples from root (use suites still present after migration):

```sh
pnpm --filter histoire exec vitest run src/node/__tests__/log-event.spec.ts src/node/__tests__/embed/runtime-frame-events.spec.ts src/node/__tests__/embed/standalone-presets.spec.ts --maxWorkers=2
pnpm --filter @histoire/vue exec vitest run src/__tests__/standalone-navigation.spec.ts src/__tests__/workbench-search-focus.spec.ts src/__tests__/events-panel.spec.ts --maxWorkers=2
```

Use installed Node/pnpm binaries directly if `mise` attempts writes outside sandbox; do not modify toolchain config to bypass a test failure. Current historical fallback paths must be rechecked before use.

## Browser commands and modes

Build app/core/framework packages first. In `examples/vue3`, start actual dev server with `pnpm run story:dev` (default current config port 6006), or build via `pnpm run story:build` then serve with `pnpm run story:preview` (script port 4567). Run servers in managed sessions; retain startup errors and close only owned sessions.

```sh
pnpm exec cypress run --spec cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js,cypress/e2e/ui-round-2-regressions.cy.js --config baseUrl=http://localhost:6006,retries=0 --env workbenchMode=dev
pnpm exec cypress run --spec cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js,cypress/e2e/ui-round-2-regressions.cy.js --config baseUrl=http://localhost:4567,retries=0 --env workbenchMode=static
```

Also select existing behavior suites for events, presets/state, grid, custom controls, source and nested deployment contracts. Current Vue example paths include `event.cy.js`, `state.cy.js`, `state-grid.cy.js`, `controls.cy.js`, `controls-overlays.cy.js`, `basebutton-grid.cy.js`, `codegen-vue3.cy.js`, `markdown-links.cy.js`, `toolbar-background.cy.js`, `story-tests-panel.cy.js` and `workbench-tests-panel.cy.js`. Inspect each test's current mode gates before invocation; dev test-runner cases do not apply to static mode.

Reuse existing nested-base/hash/embedded integration fixtures discovered by ledger. Do not alter real project router/base config solely for smoke tests.

For Svelte and Nuxt, existing `test:examples` scripts build and run static browser acceptance; execute framework checks serially because their scripts share port 4567. For React, inspect current example/plugin tests and run available story-render/bridge checks; missing Cypress script is not authorization to omit actual runtime proof. Extend existing cross-framework runtime fixture if it already covers React. Record unavailable environments as blocked acceptance.

## Gate matrix

| Boundary | Required proof | Owner |
| --- | --- | --- |
| Sandbox URL deployment/identity | Root/nested/special/omitted-variant unit cases; nested isolated link browser | 02, 08 |
| Client event host fallback | Actual compatibility Pinia store, cleaned payload, independent/reset histories | 03 |
| Runtime events | Actual publisher, correct actor/document/selection, stale rejection, browser interaction | 03, 08 |
| Removed route/state chain | Source graph compiles; fresh build excludes chain | 03, 07 |
| Search/commands | Current mounted pane/context/prompts/focus/retirement tests and browser | 03–04, 08 |
| Old host test/bridge retirement | Current collect/run/state/security ownership proof retained | 03, 05 |
| Shared toolbar/primitives/icons | Current consumers compile/run; live offline registry aliases retained | 05 |
| CSS/assets | Fresh CSS/fonts/license output; light/dark/narrow/runtime visual checks | 06–08 |
| Generated runtime import paths | Fresh-output resolution and actual generated-runtime load | 07 |
| Preset persistence | Explicit embed entry, old-key load/save/invalid/denied-storage cases | 07 |
| Portable SDK/embed | Existing package imports/consumer disposal/provider isolation | 07–08 |
| Framework mount bridge | Vue/Svelte/React/Nuxt results reported separately | 08 |
| Integrated source | Full affected suites/typechecks/lint/build/docs | 07–08 |

## Cleanup-specific review

- Fresh source/output contains no old global router/view/panel/search dependency chain.
- Minimal `stores/events.ts` host fallback remains intentionally retained and router-free.
- No lost runtime entry because generated template strings were omitted from import scan.
- No stale dist file manually removed to disguise missing source/build cleanup.
- No broad storage migration, runtime Pinia/vendor removal, icon alias purge or Tailwind purge.
- No valuable test retired without current owner coverage; no redundant successor test merely rephrasing existing proof.
- No unrelated concurrent source, staged work or assets reverted.

## Results format

Implementation creates `implementation-validation.md` with slice/gate, command, source identity, result (`passed`, `failed`, `blocked`, `skipped`), logs/screenshots and limits. Record reason for every skipped/blocked required gate. Baseline environment failures and cleanup regressions remain separate. Mark accepted only when required gates pass; deployment/CI/live ACP are outside this plan.
