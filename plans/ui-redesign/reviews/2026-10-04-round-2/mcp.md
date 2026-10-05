# Screenshots and MCP review — slices 14 and 15

Reviewed current checkout read-only on 2026-10-04. Two verified actionable findings: one P2, one P3. No repository source/doc edits, Git operations, builds, typechecks, root dev-server interactions, browser or Cypress runs. All new probes and logs live under `/tmp/histoire-ui-review-round-2/mcp/`; generated image fixture directories were removed in `finally`.

## 1. [P2] Admitted capture results can exceed channel budget and disappear

Primary location: `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/screenshot.ts:67` (capture reply), with analogous inventory reply at line 71. Supporting boundary: `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/channel.ts:24-26,37-41`; `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/validation.ts:20-34`; `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/files.ts:59-60`.

Trigger: valid request containing 64 targets with 430-character story and variant IDs. Request schema accepts these identities, and request bytes fit under 64 KB. Response retains those identities plus generated file paths, which makes it larger than request. `channel.send` then throws `UI payload exceeds 64 KB or is not JSON`; outer request handler swallows that error and sends no fallback reply.

Verified production path: actual `registerScreenshotChannel`, actual schema and channel, actual screenshot files and JSON sidecars. Only execution/browser port is stubbed to return existing valid PNG fixture. Probe reports request **57,085 bytes**, response **71,969 bytes**, complete custom frame **72,034 bytes**, **64 enqueues**, **64 persisted PNGs**, and **zero client replies**. Popover clears its `requestId` only on correlated result or disconnect, so capture remains pending and another capture is blocked. This contradicts current documentation's claim that 64 frames guarantee result fits channel.

Related verified inventory case: existing `listScreenshotFiles` budgets file array using fixed 512-byte envelope reserve. A valid 256-character control-character `requestId` consumes 1,552 request bytes after JSON escaping. Twenty generated files with 1,480-character IDs produce response **66,042 bytes**, complete custom frame **66,112 bytes**, and **zero replies** even though inventory's own array passed its byte check. This is same missing complete-response budget boundary; no separate finding counted.

Evidence: `probe.spec.ts` has two passing independent probes; `result-budget-proof.json`, `list-budget-proof.json`, and `probes.log` preserve exact receipts. PNG fixtures were generated then deleted; no private source, credentials or image bytes were dumped.

Fix boundary: budget complete response/custom event before executing/admitting capture, or introduce bounded correlated chunks with final completion semantics. Preserve exact target/frame identities and all successful file receipts. At minimum send recoverable correlated error rather than silently dropping completion. Recent inventory must reserve actual escaped request ID and event wrapper bytes, omitting whole rows when required. Do not truncate IDs. Useful regression: exercise actual channel with valid large multi-target request, assert eventual correlated completion/error and every encoded event <= 65,536 bytes; cover long escaped list correlation IDs separately.

## 2. [P3] Home activity still offers Cancel for uncancellable reads

Location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/mcp/McpActivity.vue:33`.

Trigger: MCP read tool remains running, e.g. `histoire_get_docs`, with authoritative `cancellable: false`. Home `Agent activity` renders enabled `Cancel operation` button unconditionally. `createMcpStore.cancel` correctly rejects read operations at `/home/akryum/Projects/histoire/packages/histoire-app/src/app/stores/mcp.ts:117`, so click sends nothing and shows no feedback. Same operation's dedicated MCP pane already uses `isMcpOperationCancellable` and hides Cancel correctly.

Verified mounted production SFC and real `createMcpStore` in jsdom. Probe supplies sanitized read operation via store's actual subscribed snapshot callback; only transport and SDK catalog snapshot ports are fixtures. Home button exists and is enabled, corresponding `McpCurrentOperation` button is absent, click emits zero requests, operation remains running, and no error is shown. This leaves historical cancellation-capability fix incomplete in Home surface.

Fix boundary: reuse `isMcpOperationCancellable(current)` in `McpActivity`, matching pane. Useful regression: mount Home with uncancellable running read then owned queued/running execution; assert Cancel absent for read, present only for execution, and execution click carries exact ID.

Evidence: `home-cancel.spec.ts`, `home-cancel.log` (one passing probe). First harness attempt failed before running any test because absolute Vitest import prevents mock-API hoisting; changed only temporary harness import/alias, rerun passed. No product defect inferred from that setup failure.

## Scope and validation

Read README, slices 14/15, relevant architecture/contracts, user screenshot/MCP documentation, historical review/closure records, validation/refinement records, screenshot toolbar and MCP component mockup PNGs. Traced screenshot toolbar targets, immutable snapshots, generated files/HTTP route, channel admission/replies/cancellation, shared browser task/readiness/cleanup, observer projection/history/clients, cancellation owner, mount-scoped activity store, Follow and exact canvas document/cursor guards, Home and MCP pane actions, and dev/static source gating.

Existing suites: **11 files / 47 tests pass**. Independent probes: **2 files / 3 tests pass**. Total unique completed tests: **13 files / 50 tests**. Every invocation used `--maxWorkers=2`.

Commands (Node/Pnpm PATH prefix set to paths supplied by root):

```sh
# cwd: /home/akryum/Projects/histoire/packages/histoire
pnpm exec vitest run src/node/__tests__/ui-channel.spec.ts src/node/__tests__/ui-screenshot.spec.ts src/node/__tests__/ui-screenshot-target.spec.ts src/node/__tests__/ui-screenshot-display.spec.ts src/node/__tests__/ui-mcp-channel.spec.ts src/node/__tests__/ui-mcp-cursor.spec.ts src/node/__tests__/ui-mcp-activity.spec.ts src/node/__tests__/ui-mcp-config.spec.ts src/node/__tests__/mcp/ui-activity.spec.ts src/node/__tests__/mcp/ui-observer.spec.ts --maxWorkers=2
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/mcp/vitest.config.mts --maxWorkers=2

# cwd: /home/akryum/Projects/histoire/packages/histoire-vue
pnpm exec vitest run src/__tests__/workbench-screenshot-targets.spec.ts --maxWorkers=2
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/mcp/vitest.vue.config.mts --maxWorkers=2
```

Logs: `existing-core.log` (10 files / 45), `existing-vue.log` (1 / 2), `probes.log` (1 / 2), `home-cancel.log` (1 / 1). First core invocation ran successfully but async completion was not retained by parent tool cell; log-backed rerun supplies cited final counts. Screenshot probe rerun added actual send receipts and inventory case; no product files changed.

No additional confirmed defect in inspected cancellation isolation, exact source/document cursor guards, immutable JSON Boolean/string/nested props capture, shared queue/browser cleanup, operation IDs/privacy projections, directory/path confinement, encoding bounds or dev gating. This is scoped source/test evidence, not blanket acceptance.

## Limits and unverified concerns

Root owns live-browser, pixel, actual HTTP/stdin MCP and static artifact acceptance. Review did not run actual browser capture, real connected MCP cancellation/follow, live runtime restart, full integration suites, static builds or cross-framework acceptance. Client live color scheme/globals/text direction are absent from UI screenshot request; resolver uses server configuration and LTR, but display parity under changed client preferences was not probed here, so no additional finding asserted. No credentials or external services were used.

Memory registry quick search returned no directly relevant UI-redesign entry; no historical memory facts used.
