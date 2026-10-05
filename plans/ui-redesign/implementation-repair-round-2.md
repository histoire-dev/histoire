# UI redesign repair campaign — round 2

Date: **2026-10-04**. User authorized repairs with Terra xhigh subagents. Eleven scoped implementation owners repaired all 27 findings from [review round 2](implementation-review-round-2.md). Separate reviewers checked the affected contracts and reproduced additional ownership edges before accepting source fixes. Root integrated package builds, typechecking, full package suites and browser acceptance.

**All 27 findings are closed within their reviewed scope.** Fresh package builds, three TypeScript graphs, five full package suites, repository lint and Vue dev/static browser acceptance passed. The closure ledger below records repairs and durable regressions; exact counts, commands and limits are in [implementation validation](implementation-validation.md#2026-10-04-round-2-repair-campaign). Nothing was staged, committed or pushed. Unrelated concurrent changes were preserved.

## ACP redaction — R1

Owner: `fix_acp_redaction`; independent review: `verify_redaction`.

- **R1:** Public sanitizer retains every saved environment and every active/retiring runtime's captured environment. Colliding keys no longer discard values. Retiring process credentials remain covered through shutdown output and errors. Normalized environments and the secret set have explicit string types.
- Source: [ACP manager](../../packages/histoire/src/node/acp/manager.ts), [runtime record](../../packages/histoire/src/node/acp/record.ts), [redactor](../../packages/histoire/src/node/acp/user-data.ts).
- Regression: [acp-manager.spec.ts](../../packages/histoire/src/node/__tests__/acp-manager.spec.ts) uses controlled child processes and fake credentials for duplicate environment keys, public projections and SIGTERM rotation. [acp-user-data.spec.ts](../../packages/histoire/src/node/__tests__/acp-user-data.spec.ts) covers private persistence/redaction.

## Comment capacity and composer ownership — R2, R8, R9

Owner: `fix_comments`; independent review: `fix_tests_model`.

- **R2:** Admission reserves exact encoded whole-file capacity for a bounded completed reply before dispatch. Canonical realpath file lanes share reservations across aliases and protect them from concurrent writes. Persistence replaces the reservation before release.
- **R8:** Pending composer acknowledges only an exact persisted draft match. Correlated failures release only their matching request ID. Unrelated and stale snapshots update published state without enabling duplicate sends.
- **R9:** Reply drafts and emitted ownership are keyed by comment ID. Thread replacement cannot submit the previous thread's input to a successor; same-thread updates retain current input.
- Source: [capacity](../../packages/histoire/src/node/comments/capacity.ts), [store](../../packages/histoire/src/node/comments/store.ts), [client store](../../packages/histoire-app/src/app/stores/comments.ts), [CommentThread](../../packages/histoire-app/src/app/components/comments/CommentThread.vue).
- Regression: `comments-capacity.spec.ts`, `comments-store.spec.ts`, `comments-channel.spec.ts`, `comments-client.spec.ts` in core; [comment-thread.spec.ts](../../packages/histoire-vue/src/__tests__/comment-thread.spec.ts) in native Vue. Concurrent upsert assertions compare exact persisted identities/content without assuming caller order before asynchronous realpath resolution.

## Config editing and receipts — R3, R26, R27

Owner: `fix_config_codemod`; independent review: `verify_config`.

- **R3:** Shared initializer ownership accounts for static references throughout the config object, including non-allowlisted siblings. Unsafe unselected sibling changes refuse before write. Identical edits deduplicate; final semantic verification evaluates terminal overlapping patch intents so sequential last-write behavior remains supported.
- **R26:** Nearest lexical literal binding wins over an imported name. Unsupported parameter and destructuring shadows remain explicit refusals.
- **R27:** Keyed preset ID changes, whole-item identity changes and duplicate IDs refuse before persistence. Full-collection changes may rename IDs when unique. No write can succeed and then fail solely because its receipt still selects a retired ID.
- Source: [codemod ownership](../../packages/histoire/src/node/config/codemod/ownership.ts), [verification](../../packages/histoire/src/node/config/codemod/verify.ts), [binding lookup](../../packages/histoire/src/node/config/codemod/locate.ts), [save receipts](../../packages/histoire/src/node/server/ui-channel/config-receipts.ts).
- Regression: `config-codemod.spec.ts`, `config-codemod-preservation.spec.ts`, `config-codemod-write.spec.ts`, `ui-config-channel.spec.ts`. Tests load effective config values and check source remains unchanged on refusal. [User contract](../../docs/reference/config-codemod.md) documents keyed identity preservation.

## Acquisition/watch transitions — R11

Owner: `fix_config_watchers`; independent review: `verify_config`.

- **R11:** Capture watched revision before acquisition, including acquired Histoire/Vite selections and discovery candidates. Reconcile after actual watcher readiness through the serialized restart lane. A retired acquisition does not publish ready while restart is queued.
- Follow-up review added first Vite config creation, selected TS removal with JS fallback, JS-to-higher-priority-TS replacement and inherited parent config priority from a child project root.
- Source: [watchers](../../packages/histoire/src/node/runtime/config-watchers.ts), [start](../../packages/histoire/src/node/runtime/start.ts), [controller](../../packages/histoire/src/node/runtime/controller.ts).
- Regression: [config-watchers.spec.ts](../../packages/histoire/src/node/__tests__/config-watchers.spec.ts), save recovery and runtime lifecycle coverage. Independent watcher/recovery/lifecycle run: 3 files, 24 tests passed.

## Test execution transport — R5, R6

Owner: `fix_tests_transport`; independent canvas/transport review.

- **R5:** Browser AbortSignal sends cancellation with original request ID. Server retains exact socket-owned active/queued execution handles through cleanup. Stop and socket retirement cancel only their owned jobs; foreign clients' jobs survive. Typed cancellation/runtime errors survive transport.
- **R6:** Execution captures catalog provenance and validates it at lane head, before runner start and after completion. API and embedded transport guards compose this validation. Queued retired source cannot start a runner.
- Source: [dev adapter](../../packages/histoire-app/src/app/components/panes/tests/dev-runner.ts), [dev event API](../../packages/histoire-app/src/app/util/dev-event-api.ts), [server events](../../packages/histoire/src/node/server/dev-events.ts), [execution service](../../packages/histoire/src/node/test/execution-service.ts).
- Regression: `workbench-test-runner.spec.ts`, `plugin-send-event.spec.ts`, `server-dev-event.spec.ts`, `test-execution-provenance.spec.ts`, embedded catalog admission/cancellation. Real lane/channel tests hold runner cleanup and verify successor admission and request-ID reuse.

## Test model and diagnostics — R7, R19

Owner: `fix_tests_model`; independent Settings/tests review.

- **R7:** Catalog publication compares per-story executable runtime revision. Changed or missing provenance marks results stale and invokes Watch once. Unchanged provenance and ordinary state/selection publications preserve completed results.
- **R19:** Collection-error rows remain available even when a headingless group was collapsed. Diagnostic activation uses exact target. Recovery preserves the user's ordinary collapse choice.
- Source: [test model](../../packages/histoire-app/src/app/components/panes/tests/model.ts), [TestsTree](../../packages/histoire-app/src/app/components/panes/tests/TestsTree.vue).
- Regression: [workbench-tests-bulk.spec.ts](../../packages/histoire-vue/src/__tests__/workbench-tests-bulk.spec.ts), [workbench-tests-tree.spec.ts](../../packages/histoire-vue/src/__tests__/workbench-tests-tree.spec.ts) and existing test provenance/model suites.

## Settings identities, save lifetime and serializers — R4, R10, R18, R24

Owner: `fix_settings`; independent Settings/tests review.

- **R4:** Drafts retain stable preset ownership and row keys across preceding removal/default reorder. Submit resolves current owner; removal cannot redirect an edit into a successor row.
- **R10:** Multiple successful save receipts remain persisted until exact path/value consumption, across section/workbench remount and later saves. Edits made after submission remain local.
- **R18:** Background swatches use the shared background patch conversion, including checkerboard semantics.
- **R24:** MCP Settings independently exposes safe HTTP and stdio client configuration. Private environment values never enter copy blocks.
- Source: [preset config](../../packages/histoire-app/src/app/stores/presets-config.ts), [project config](../../packages/histoire-app/src/app/stores/project-config.ts), [save persistence](../../packages/histoire-app/src/app/stores/project-save-persistence.ts), [Settings sections](../../packages/histoire-app/src/app/components/pages/settings/).
- Regression: [ui-settings.spec.ts](../../packages/histoire/src/node/__tests__/ui-settings.spec.ts), [project-config-recovery-client.spec.ts](../../packages/histoire/src/node/__tests__/project-config-recovery-client.spec.ts), existing safe MCP serialization and background patch tests.

## Matrix frame actions and Measure/Pan — R13, R14

Owner: `fix_canvas`; independent canvas/transport review; root browser integration.

- **R13:** Pointer context menu, Shift+F10 and ContextMenu keys capture exact registered Matrix cell/base identity through the shared frame menu path. Menu activation preserves canonical and local selection; shortcuts use scoped registered Matrix chrome.
- **R14:** Measure relays accepted pan gestures to the existing pointer controller, preserving client-pixel math and capture/move/end/cancel. Primary drag click suppression leaves ordinary clicks and keyboard lock usable. Middle auxclick does not suppress a later primary lock; fresh primary down clears undelivered stale click suppression.
- Root browser acceptance exposed an additional framed-host Space edge: same-document canvas chrome was incorrectly mapped to its outer host iframe. Ownership now keeps local chrome in the root document and maps only foreign preview documents through their iframe. A nested-host-frame regression failed before repair and passes afterward.
- Source: [MatrixCell](../../packages/histoire-app/src/app/components/canvas/matrix/MatrixCell.vue), [shared frame menu](../../packages/histoire-app/src/app/components/canvas/frame-menu.ts), [MeasureOverlay](../../packages/histoire-app/src/app/components/canvas/MeasureOverlay.vue), [Space ownership](../../packages/histoire-app/src/app/components/canvas/pan/useSpacePan.ts).
- Regression: [canvas-inputs.spec.ts](../../packages/histoire-vue/src/__tests__/canvas-inputs.spec.ts), core canvas pan/frame/menu ownership suites, [browser regressions](../../examples/vue3/cypress/e2e/ui-round-2-regressions.cy.js). Native drag moved selected cell by 45.003px/34.994px while measurement stayed unlocked.

## Inspector and native Markdown lifetime — R15, R16, R17, R23

Owner: `fix_inspector`; independent inspector/redaction review.

- **R15:** Reset routes through StatePresets owner and clears saved selection/menu only after current reset acknowledgment. External Reset is disabled while initial preset-list ownership is pending; stale acknowledgments cannot alter successor selection.
- **R16:** Native scoped local-anchor emission reaches MarkdownPage. Copy link retains encoded selected heading ID without changing host navigation ownership.
- **R17:** Dynamic Source mounts/reads only a ready runtime. Pending navigation displays loading without false failure/Retry; raw source remains independently available. Explicit unavailable errors remain visible.
- **R23:** Delayed clipboard/editor failure publishes only for the captured current content/owner.
- Source: [HistoireControls](../../packages/histoire-vue/src/components/controls/HistoireControls.ts), [StatePresets](../../packages/histoire-vue/src/components/controls/StatePresets.ts), [HistoireDocs](../../packages/histoire-vue/src/components/docs/HistoireDocs.ts), [MarkdownPage](../../packages/histoire-app/src/app/components/pages/markdown/MarkdownPage.vue), [SourceDrawer](../../packages/histoire-app/src/app/components/inspector/SourceDrawer.vue).
- Regression: `controls-panel.spec.ts`, `presets-ownership.spec.ts`, `workbench-content-ownership.spec.ts`, content-panel/source tests and browser copied-anchor assertion. Delayed-list reset and retired acknowledgment probes were independently repeated after repair.

## Virtual tree focus and Search ownership — R20, R21, R22

Owner: `fix_shell_search`; independent shell/inspector review.

- **R20:** Recycler-aware fallback gives the tree a Tab stop when its logical roving row is absent. Keyboard entry reveals/focuses the exact current row; ordinary scroll does not steal focus.
- **R21:** Stable result/command IDs and a semantic polite cursor announcement expose keyboard movement for variants, Docs, commands and distant rows. Canonical aria-current selection remains independent.
- **R22:** Error publication requires current activation generation, source and selection intent. Retired cancellation is suppressed; current live failures still report.
- Source: [StoriesPanel](../../packages/histoire-app/src/app/components/panes/stories/StoriesPanel.vue), [SearchPanel](../../packages/histoire-app/src/app/components/panes/search/SearchPanel.vue), [result accessibility](../../packages/histoire-app/src/app/components/panes/search/accessibility.ts).
- Regression: native Vue tree/Search keyboard, virtualization and retirement suites. Real browser AX output announced `untitled, variant result, 2 of 45` after ArrowDown while search input retained focus.

## Screenshot channel budget and Home MCP actions — R12, R25

Owner: `fix_mcp_screenshots`; independent review: `fix_tests_model`.

- **R12:** Capture admission budgets the entire encoded Vite custom-event response, including escaped correlation identity, file receipts and errors. Oversized requests return a bounded correlated error before enqueue/write. Unexpected oversized completion has a bounded fallback. Inventory includes exact wrapper/ID cost and retains whole rows.
- **R25:** Home uses the same cancellable-operation contract as the dedicated activity pane. Read-only requests expose no inert Cancel; execution cancellation sends exact request ID.
- Source: [screenshot channel](../../packages/histoire/src/node/server/ui-channel/screenshot.ts), [file budgeting](../../packages/histoire/src/node/server/ui-channel/files.ts), [validation](../../packages/histoire/src/node/server/ui-channel/validation.ts), [McpActivity](../../packages/histoire-app/src/app/components/panes/mcp/McpActivity.vue).
- Regression: [ui-screenshot-channel.spec.ts](../../packages/histoire/src/node/__tests__/ui-screenshot-channel.spec.ts) uses actual channel/schema/receipt boundaries with valid controlled PNG fixtures. [workbench-mcp-activity.spec.ts](../../packages/histoire-vue/src/__tests__/workbench-mcp-activity.spec.ts) mounts real Home through existing native Vue compiler/provider graph. Existing preview browser fixture is reused.

## Verification boundaries

Focused reviewer counts overlap and are not summed. Full package counts, exact final browser commands, build/typecheck/lint results and remaining environment limits belong in [implementation validation](implementation-validation.md). Regression source covers ownership/admission/transport behavior; styling is inspected in browser rather than encoded as class/style assertions.

Credentialed ACP adapters, Windows containment, live external MCP, full cross-framework browser campaigns, CI and deployment are outside this repair campaign. Controlled Linux fixtures and Vue dev/static acceptance do not imply those results. Earlier historical repairs and eight review reports retain their original scopes.
