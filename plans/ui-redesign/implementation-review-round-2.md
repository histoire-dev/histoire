# UI redesign implementation review — round 2

Current status: **all 27 findings below are repaired and revalidated within their reviewed scope.** See [round 2 closure ledger](implementation-repair-round-2.md) and [fresh executed validation](implementation-validation.md#2026-10-04-round-2-repair-campaign). Original review evidence below remains a historical pre-repair snapshot.

Fresh review completed **2026-10-04**, following the earlier repair campaign. Eight independent subagents reviewed all 20 slices against source, contracts, user refinements, supplied mockups and focused behavior tests. Root independently repeated credential/config probes and exercised Matrix menus and Measure/Pan in the browser.

**Review snapshot: 27 new verified findings, comprising 1 P1, 20 P2, 6 P3. P1/P2 findings blocked acceptance at that checkpoint.** Earlier [27 historical findings and closures](implementation-review.md) retain their original scope. The review phase made no source fixes or acceptance claims from earlier runs.

During the review phase, only review documentation was added/updated in the repository. Source, tests, dependencies and unrelated concurrent changes were preserved. No build, typecheck, Cypress, staging, commit, push or deployment was performed then. Temporary review probes/logs live under `/tmp/histoire-ui-review-round-2`; subsequent durable regressions and repair checks are listed separately in the closure ledger.

## P1

### R1. Public ACP redaction loses credentials across agents and rotation

Source: [manager.ts:40](../../packages/histoire/src/node/acp/manager.ts#L40), with rotation at lines 219–221. Detailed [ACP/comments review](reviews/2026-10-04-round-2/acp.md).

Two agents with the same environment key and different values lose the earlier value from the public sanitizer because `Object.assign` overwrites it. That agent's stderr reaches public snapshot events unredacted. Separately, credential rotation replaces sanitizer input before retiring the previous process; its SIGTERM stderr can publish the old credential. Local final-reply redaction does not protect these public paths.

Actual controlled child processes reproduced both cases using fake credentials only. Root independently reran both probes: two tests reproduced leaks. No real credentials or credentialed adapters were used.

Required boundary: collect every credential value without key collision and retain each runtime's secret set until all output/error/permission publication retires. Regression must cover colliding keys plus live rotation/shutdown across every public projection.

## P2

### R2. Aggregate comment-file capacity admits an unpersistable completed reply

Source: [store.ts:118](../../packages/histoire/src/node/comments/store.ts#L118), aggregate limit [file.ts:49](../../packages/histoire/src/node/comments/file.ts#L49). Detailed [ACP/comments review](reviews/2026-10-04-round-2/acp.md).

A valid 243-comment file sits 1,024 bytes below its 2 MiB bound. Target thread remains well below its own bounds, so agent work starts. Successful 6,800-character reply then cannot persist; target becomes `replied` with an empty thread and error `Agent completed, but its comment reply could not be stored. Existing history is preserved.` Existing history survives, but new outcome is lost.

Required boundary: reserve whole encoded file capacity before dispatch in the shared physical-file lane, accounting for concurrent replies/comment writes. Regression must reject near-limit work before runner invocation and protect reserved bytes across clients.

### R3. Shared config initializer changes an unchanged sibling permission

Source: [update.ts:42](../../packages/histoire/src/node/config/codemod/update.ts#L42). Detailed [config review](reviews/2026-10-04-round-2/config.md).

Given `const permission = 'ask'` referenced by both `fileEdits` and `terminal`, saving `{ fileEdits: 'ask', terminal: 'never' }` edits the shared initializer. Actual `loadConfigFile` then yields both permissions as `never`. Saving both as `never` emits overlapping edits and throws `Overlapping config source edits`. Root independently reproduced both expected-behavior failures.

Required boundary: account for shared references before initializer edits, deduplicate identical ranges, refuse conflicting effective values or use safe reference-specific edits. Regression must load returned source and verify unchanged sibling values as well as requested values.

### R4. Preset drafts overwrite another row after preceding removal

Source: [ViewportsSection.vue:25](../../packages/histoire-app/src/app/components/pages/settings/ViewportsSection.vue#L25), [BackgroundsSection.vue:42](../../packages/histoire-app/src/app/components/pages/settings/BackgroundsSection.vue#L42). Detailed [Settings review](reviews/2026-10-04-round-2/settings.md).

Edit Tablet, remove preceding Phone, then submit renamed draft: captured array index now belongs to Desktop. Mounted actual components/store silently lose Desktop and leave original Tablet unchanged. Backgrounds reproduce equivalent Gray/Black loss. Local persistence and later project saves inherit wrong collection.

Required boundary: retain stable preset identity and resolve it at submit; removed owners cannot update a successor row. Regression must cover preceding removal, edited-owner removal and default reordering for both collections.

### R5. Tests Stop cancels browser promise while server work continues

Source: [dev-runner.ts:19](../../packages/histoire-app/src/app/components/panes/tests/dev-runner.ts#L19), [dev-events.ts:38](../../packages/histoire/src/node/server/dev-events.ts#L38). Detailed [Tests review](reviews/2026-10-04-round-2/tests.md).

Run/Stop/Run/Stop rejects both browser promises with `CANCELLED`, but real server execution signal stays un-aborted and one replacement remains queued. Server handler discards execution handle and browser adapter sends no cancel. Workers continue occupying the shared lane after UI returns to idle; repeated runs accumulate invisible work.

Required boundary: correlate socket-owned execution handles and cancel exact active/queued request on abort or client retirement. Regression must use real lane/adapter with held runner, prove cleanup before successor execution and preserve other clients' jobs.

### R6. Queued UI tests survive catalog retirement

Source: [execution-service.ts:26](../../packages/histoire/src/node/test/execution-service.ts#L26). Detailed [Tests review](reviews/2026-10-04-round-2/tests.md).

Queue tests behind occupied lane, replace story bytes and catalog within same runtime, then release lane. Head validation checks runtime activity only, so retired request starts runner once. Its metadata belongs to old catalog while later worker imports current files. SDK HTTP path already guards captured catalog identity.

Required boundary: validate captured catalog/source identity and readiness before acquisition and after run. Regression must replace catalog while queued and prove runner never starts; unchanged current publication must remain usable. Probe used real catalog/lane and a mocked runner, not browser evaluation of modified bytes.

### R7. Catalog-only executable changes leave completed test cache current

Source: [model.ts:75](../../packages/histoire-app/src/app/components/panes/tests/model.ts#L75). Detailed [Tests review](reviews/2026-10-04-round-2/tests.md).

After completed run, publish new source revision and changed valid executable digest without separate exact-story HMR event. Completed entries retain non-stale status; prior pass remains current and Watch makes zero calls. Inspector trusts this stale bit, so old results can populate new source. Full recollection/resynchronization can produce this event sequence.

Required boundary: compare executable story provenance on catalog publication, reuse invalidation/Watch machinery, retain results only when identity/digest remains valid. Regression must cover changed digest without exact event plus unchanged-digest control.

### R8. Unrelated comment snapshots acknowledge pending composer

Source: [comments.ts:67](../../packages/histoire-app/src/app/stores/comments.ts#L67). Detailed [ACP/comments review](reviews/2026-10-04-round-2/acp.md).

Submit draft, then receive another client's full snapshot before own persistence. Any snapshot clears pending state even when submitted ID is absent or writable values are old. Actual store then accepts identical second send. Editing an existing draft can also lose pending ownership on stale same-ID publication.

Required boundary: correlated completion or exact submitted-value matching; unrelated broadcasts update state without acknowledging request. Regression must interleave clients' publications and preserve submitted text on failure.

### R9. Thread replacement sends previous thread's unsent input to new owner

Source: [CommentThread.vue:29](../../packages/histoire-app/src/app/components/comments/CommentThread.vue#L29); unkeyed callers in canvas overlay and Comments pane. Detailed [ACP/comments review](reviews/2026-10-04-round-2/acp.md).

Type reply in A, switch directly to B, then submit. Actual reused component retains A's input while caller uses B's ID, agent and story/variant context. Mounted SFC reproduces wrong-owner instruction emission.

Required boundary: key drafts/components by comment ID or clear on owner change; same-thread streaming must preserve input. Regression must exercise A-to-B replacement and same-thread update control.

### R10. Next Settings save discards successful unconsumed receipt

Source: [project-config.ts:99](../../packages/histoire-app/src/app/stores/project-config.ts#L99), consumption [SaveToProject.vue:17](../../packages/histoire-app/src/app/components/pages/settings/SaveToProject.vue#L17). Detailed [Settings review](reviews/2026-10-04-round-2/settings.md).

Save viewport, leave section before successful completion, then save arrangement before returning. No mounted viewport consumes first receipt; second save clears confirmed paths and replaces submission/persistence record. On remount, viewport override remains, first receipt is gone and retirement callback never ran. Later project defaults stay hidden behind stale browser override.

Required boundary: store-lifetime retirement or retained per-path/request receipts until consumed. Preserve edits made after submission. Regression must save across section unmount/remount and a second section's save.

### R11. Initial config watcher misses acquisition/scan transitions

Source: [config-watchers.ts:42](../../packages/histoire/src/node/runtime/config-watchers.ts#L42), [controller.ts:66](../../packages/histoire/src/node/runtime/controller.ts#L66). Detailed [config review](reviews/2026-10-04-round-2/config.md).

Actual chokidar probe changes config after byte snapshot but before initial scan completes: `ignoreInitial` absorbs new contents, no reconciliation runs, restart count remains zero. Actual controller with minimal acquisition also publishes old grid config when `onGeneration` writes list before watcher installation; new bytes become baseline and no restart occurs.

Required boundary: capture watched revision with acquisition and reconcile after watcher readiness before publishing ready generation. Regression must cover both windows through serialized byte-change lane. Full Vite acquisition was not run for this case.

### R12. Valid screenshot completions exceed channel limit and vanish

Source: [screenshot.ts:67](../../packages/histoire/src/node/server/ui-channel/screenshot.ts#L67), inventory reply at line 71. Detailed [screenshots/MCP review](reviews/2026-10-04-round-2/mcp.md).

Valid 64-target request is 57,085 bytes. Real channel/schema/file path writes all 64 PNGs, but complete result event is 72,034 bytes, exceeding 65,536-byte limit. `channel.send` throws `UI payload exceeds 64 KB or is not JSON`; outer handler swallows it, client receives zero replies and capture stays pending. Inventory's fixed envelope reserve also fails with a valid escaped correlation ID: 66,112-byte event, zero replies.

Required boundary: budget complete encoded response before admission, or bounded correlated chunks with final completion; at least return correlated recoverable error. Preserve exact IDs/file receipts. Regression must cover both large capture and escaped inventory request IDs using actual channel. Browser executor alone was stubbed with valid PNG fixture.

### R13. Matrix cells omit exact-target frame menu

Source: [MatrixCell.vue:61](../../packages/histoire-app/src/app/components/canvas/matrix/MatrixCell.vue#L61). Detailed [canvas review](reviews/2026-10-04-round-2/canvas.md).

Matrix chrome binds neither `contextmenu` nor Shift+F10/ContextMenu activation. Pointer/keyboard SFC probes leave menu target null. Root independently right-clicked and pressed Shift+F10 on ready Boolean cell: no Histoire menu appeared. Exact cell screenshots/source/AI frame actions are unavailable through menu despite existing registry tuple.

Required boundary: reuse ordinary frame activation and exact Matrix registry identity without changing canonical/local selection. Update frame shortcut scope. Regression must verify pointer, both keyboard paths and exact target after base replacement.

### R14. Measure surface consumes Pan, middle mouse and held Space gestures

Source: [MeasureOverlay.vue:119](../../packages/histoire-app/src/app/components/canvas/MeasureOverlay.vue#L119). Detailed [canvas review](reviews/2026-10-04-round-2/canvas.md).

Enable Measure, choose Pan, start drag inside selected preview. Teleported measurement surface unconditionally prevents/stops pointerdown; shared pan controller never starts. Mounted production integration reproduces all three pan intents. Root native drag on ready Matrix cell leaves x/y exactly unchanged and instead locks `720×640`, while Measure and Pan remain pressed.

Required boundary: yield/relay accepted gestures to existing pointer-pan path, including capture/move/end/cancel, and suppress measurement click after drag. Regression must preserve normal click/keyboard lock while proving pan offset changes for each intent.

Root browser evidence: [measure-pan.png](/tmp/histoire-ui-review-round-2/measure-pan.png). Cell bounds before/after native drag stayed x=495.9906, y=306.25; drag was [565,365] to [610,400]. Screenshot shows locked measurement and active Pan; unchanged bounds establish failed motion.

### R15. Inspector Reset state retains saved preset selection

Source: [HistoireControls.ts:140](../../packages/histoire-vue/src/components/controls/HistoireControls.ts#L140). Detailed [inspector/Markdown review](reviews/2026-10-04-round-2/inspector.md).

Apply saved preset, edit state, press external Reset state. Runtime resets and clears selected preset, but button bypasses StatePresets owner; native select still equals saved ID and Rename/Delete remain eligible. Actual controls + SDK + runtime owner probe confirms initial state with stale selected preset.

Required boundary: route reset through same owner or clear/refresh after current acknowledged reset. Regression must verify select/menu and state together, including overtaken reset guard.

### R16. Markdown Copy link omits anchor selected inside rendered content

Source: [MarkdownPage.vue:123](../../packages/histoire-app/src/app/components/pages/markdown/MarkdownPage.vue#L123), renderer [HistoireDocs.ts:68](../../packages/histoire-vue/src/components/docs/HistoireDocs.ts#L68). Detailed [inspector/Markdown review](reviews/2026-10-04-round-2/inspector.md).

Click heading permalink or inline local `#next`, then Copy link. Renderer correctly scrolls owning page without host URL mutation, but page receives no anchor update; copied URL keeps empty/previous hash. Two mounted expected-behavior probes fail; outline selection remains positive control.

Required boundary: scoped authoritative local-anchor notification, preserving renderer/routing ownership. Regression must cover heading/inline links, encoded IDs and route modes, retaining outline control.

### R17. Source displays failure during successful pending selection

Source: [SourceDrawer.vue:24](../../packages/histoire-app/src/app/components/inspector/SourceDrawer.vue#L24). Detailed [inspector/Markdown review](reviews/2026-10-04-round-2/inspector.md).

Expanded dynamic Source remains mounted while successful variant acknowledgment waits. Metadata-only availability starts read against non-ready runtime, emitting `PREVIEW_NOT_READY: Dynamic source requires ready preview`, alert and Retry. Actual SDK delayed-success probe observes all three before success clears view; host already received false failure.

Required boundary: defer standalone dynamic Source read until selected preview readiness and show loading. Preserve native explicit unavailable-preview errors and real source failures. Regression must hold successful ACK, then verify replacement content and separate rejected-generation Retry case.

### R18. Settings swatches send raw checkerboard sentinel

Source: [BackgroundsSection.vue:18](../../packages/histoire-app/src/app/components/pages/settings/BackgroundsSection.vue#L18). Detailed [Settings review](reviews/2026-10-04-round-2/settings.md).

Click supported `$checkerboard` preset in Settings. Actual SDK request sends `backgroundColor: '$checkerboard', checkerboard: false`, an invalid CSS color, while existing toolbar conversion returns transparent/true. Normal color selection also bypasses checkerboard reset conversion.

Required boundary: reuse existing `backgroundPatch`. Regression must assert canonical request for checkerboard, normal after checkerboard and transparent. Native pixels were not measured.

### R19. Collapsed test group hides all collection errors

Source: [TestsTree.vue:28](../../packages/histoire-app/src/app/components/panes/tests/TestsTree.vue#L28). Detailed [Tests review](reviews/2026-10-04-round-2/tests.md).

Collapse normal story group, then replace all variants with not-collected diagnostics. Heading disappears while children obey previous closed state. Production component displays `No failing tests` although two diagnostic rows exist, with no disclosure to recover them.

Required boundary: collapse only where reopening control exists, or always expose all-error diagnostics. Regression must move collapsed normal group to collection failure and back, preserving exact target activation.

### R20. Ordinary virtual tree scroll removes every Tab entry

Source: [StoriesPanel.vue:140](../../packages/histoire-app/src/app/components/panes/stories/StoriesPanel.vue#L140). Detailed [shell/Search review](reviews/2026-10-04-round-2/shell.md).

With focus outside tree, ordinary scroll recycles original roving row. Logical focused key still exists in full catalog, so all mounted rows have `tabindex=-1`; tree container has no fallback entry. Actual 1,000-story provider/component/recycler probe reproduces zero live entry at scrollTop 15000.

Required boundary: live keyboard entry independent of recycled row lifetime, without stealing focus during scrolling. Regression must scroll from external control, enter tree with keyboard and activate exact row. Explicit End/Home reveal coverage does not exercise this case; real browser Tab delivery was not run.

### R21. Search keyboard cursor has no accessible active-result relation

Source: [SearchPanel.vue:184](../../packages/histoire-app/src/app/components/panes/search/SearchPanel.vue#L184), [SearchResultItem.vue:36](../../packages/histoire-app/src/app/components/panes/search/SearchResultItem.vue#L36). Detailed [shell/Search review](reviews/2026-10-04-round-2/shell.md).

Arrow navigation keeps focus in input and changes result Enter will open, but input exposes no active descendant/controls, results expose no accessible keyboard-active state and no announcement exists. Canonical `aria-current` can still name first hit while Enter opens second. Production mounted semantic probe confirms absent relationship; actual screen-reader speech was not tested.

Required boundary: stable result IDs plus appropriate active-descendant semantics or explicit semantic announcement, including commands and distant virtual rows. Regression must match accessible cursor with exact Enter target without conflating canonical selection.

## P3

### R22. Superseded tree selections emit cancellation error

Source: [StoriesPanel.vue:57](../../packages/histoire-app/src/app/components/panes/stories/StoriesPanel.vue#L57). Detailed [shell/Search review](reviews/2026-10-04-round-2/shell.md).

Rapid A/B activation with delayed predecessor correctly selects B, but predecessor `RUNTIME_CHANGED` reaches host error handler because catch checks only mounted lifetime. Current standalone impact is false console error, not wrong selection or verified global alert. Guard exact intent generation; regress current failure versus retired failure.

### R23. Deferred Source action failures publish into successor owner

Source: [SourceDrawer.vue:66](../../packages/histoire-app/src/app/components/inspector/SourceDrawer.vue#L66). Detailed [inspector/Markdown review](reviews/2026-10-04-round-2/inspector.md).

Begin clipboard/editor action, change selection, then reject predecessor. Both production mounted probes emit old failure into replacement drawer/host. Guard source/selection/content/lifetime on failure as well as success, reusing ownership utility. Confirmed standalone effect is stale console feedback; no global alert claim.

### R24. MCP Settings hides usable stdio-only client config

Source: [McpSection.vue:23](../../packages/histoire-app/src/app/components/pages/settings/McpSection.vue#L23). Detailed [Settings review](reviews/2026-10-04-round-2/settings.md).

Actual safe producer metadata includes stdio launch command/args without HTTP endpoint. Settings renders Enabled but no copy action because affordance depends on endpoint. MCP pane already supplies workaround. Reuse safe serializers; regress producer-shaped stdio-only metadata, disconnect and HTTP case.

### R25. Home offers inert Cancel for uncancellable MCP reads

Source: [McpActivity.vue:33](../../packages/histoire-app/src/app/components/panes/mcp/McpActivity.vue#L33). Detailed [screenshots/MCP review](reviews/2026-10-04-round-2/mcp.md).

Authoritative running read has `cancellable: false`, yet Home renders enabled Cancel. Real store correctly sends nothing, leaving no feedback; dedicated pane hides action. Reuse `isMcpOperationCancellable`; regress Home read versus owned execution action and exact ID.

### R26. Factory-local literal shadow of import is wrongly refused

Source: [locate.ts:11](../../packages/histoire/src/node/config/codemod/locate.ts#L11). Detailed [config review](reviews/2026-10-04-round-2/config.md).

Supported local literal binding inside factory shadows imported name, but resolver checks program import map first and calls value computed/imported. Resolve nearest lexical binding first, retaining unsupported parameter/destructuring refusal. Probe establishes AST editing classification; no baseline factory execution claim.

### R27. Allowed keyed preset ID rename persists but completion fails

Source: [config-receipts.ts:110](../../packages/histoire/src/node/server/ui-channel/config-receipts.ts#L110). Detailed [config review](reviews/2026-10-04-round-2/config.md).

Accepted `agents.presets[one].id = 'renamed'` writes/loads correct value. Successor receipt still selects old ID and returns failed completion: `Saved config is not effective in this runtime. Reload settings.` Actual channel/writer/load probe confirms bytes and false failure. Current Settings writes whole collection, so affected boundary is keyed-path API. Refuse identity change before write or retain post-edit selector; regress saved completion or explicit pre-write refusal.

## Coverage and executed evidence

| Reviewer | Slices | Existing focused suites/tests passed | Independent probes |
| --- | --- | --- | --- |
| [Shell/Search](reviews/2026-10-04-round-2/shell.md) | 01, 02, 03, 08 | 11 / 54 | 3 reproduced defects |
| [Canvas/Matrix](reviews/2026-10-04-round-2/canvas.md) | 04, 05, 07, 13, 20 | 17 / 102 | 6 expected-behavior failures, including one auxiliary passive-menu readiness gap excluded from finding count |
| [Inspector/Markdown](reviews/2026-10-04-round-2/inspector.md) | 06, 11 | 18 / 68 | 6 expected-behavior failures, 1 positive control |
| [Tests](reviews/2026-10-04-round-2/tests.md) | 09 | 11 / 47 | 5 expected-behavior failures, 2 passing production virtualization checks |
| [Home/Settings](reviews/2026-10-04-round-2/settings.md) | 10, 12, 19 UI | 7 / 33 | 5 reproduced defects |
| [Screenshots/MCP](reviews/2026-10-04-round-2/mcp.md) | 14, 15 | 11 / 47 | 3 reproduced defects |
| [ACP/comments](reviews/2026-10-04-round-2/acp.md) | 16, 17 | 14 / 76 | 6 reproduced defects, including mock/real rotation variants |
| [Config backend](reviews/2026-10-04-round-2/config.md) | 18, 19 backend | 7 / 71 | 6 expected-behavior failures, 2 positive controls |

Counts overlap across reviewers and must not be summed as unique repository totals. Passing reproduction probes assert observed bad behavior; they are not acceptance passes. Expected-behavior failures come from temporary independent probes, not failing existing repository suites. Each preserved reviewer report records exact commands, log/probe paths, harness corrections, regression gaps and discarded hypotheses. Tests used at most two workers per invocation.

Root independently reran actual-process ACP leak probes (`root-acp-proof.log`) and two shared-initializer assertions (`root-config-proof.log`). Process tests initially failed in restricted sandbox because Node child executables exited without executing; approved exact process reruns passed. No source defect was inferred from sandbox behavior. Fixture processes/watchers/projects were closed by their owners.

Root live browser used current existing bundle served on port 6006, without rebuilding, at WorkbenchMatrix default/Matrix arrangement. Four Boolean cells were ready. Right-click and Shift+F10 produced no Histoire menu; native Measure+Pan drag produced locked measurement without changed cell bounds. These establish two current bundled interaction failures, not source-only hot reload or cross-framework acceptance. Temporary viewport override was reset, Stories pane restored and review tab closed. Dev server remains available for user.

Applied [Impeccable audit skill](/home/akryum/.codex/plugins/cache/openai-curated-remote/impeccable/4.3.1/skills/impeccable/SKILL.md) against existing product/design context. Detector reported zero anti-pattern failures; token advisories were not promoted into bugs without behavioral/design proof. This result does not establish visual fidelity, contrast, platform performance or screen-reader acceptance.

## Review-time limits and acceptance gates

No fresh full repository suite, build, typecheck, Cypress, static artifact, Windows process, real ACP authentication/permission, actual connected MCP, cross-framework, CI or deployment acceptance was performed in this review. Earlier validation retains its original date/scope. Mounted behavior tests use actual production components/stores/SDK ownership with controlled transport/geometry fixtures; reports identify remaining mocked boundaries.

Review-time gates required R1 credential redaction, P2 ownership/admission/data-loss/accessibility regressions, focused integration, fresh affected browser acceptance and P3 diagnostics/affordances. The subsequent [repair campaign](implementation-repair-round-2.md) completed these gates within its recorded scope. Credentialed/Windows/external MCP/cross-framework/CI/deployment limits remain explicit. Source hypotheses, deferred product decisions and detector advisories were not counted as verified findings.
