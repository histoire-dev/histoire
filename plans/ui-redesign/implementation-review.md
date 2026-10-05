# UI redesign implementation review

Latest status: [fresh review round 2](implementation-review-round-2.md) found **27 new verified findings: 1 P1, 20 P2, 6 P3** after the earlier repair campaign. All are now repaired with named evidence in the [round 2 closure ledger](implementation-repair-round-2.md) and [fresh validation](implementation-validation.md#2026-10-04-round-2-repair-campaign). Historical closures below retain their original scope.

Read-only review completed **2026-10-04**, after the implementation and acceptance work recorded in [implementation validation](implementation-validation.md). Review compared all 19 slice plans, [contracts](contracts.md), [architecture](architecture.md), current source, and supplied mockups. Earlier build/browser results were context, not fresh proof for this review.

**27 historical verified findings: 2 P1 and 25 P2. All 27 are repaired and revalidated on 2026-10-04 within the executed scope.** Matrix findings 9 and 10 closed during earlier follow-ups; scoped subagents repaired the remaining 25, with separate independent review and root integration/browser acceptance. Original reproduction evidence remains below. Each closure names behavioral regression coverage; fresh counts, browser proof and platform limits are recorded in [repair campaign validation](implementation-validation.md#2026-10-04-remaining-finding-repair-campaign).

## Scope and evidence

- Reviewers had separate ownership: foundation/shell/tree/Search; canvas/tools/matrix/context actions; inspector/Tests/Markdown/native controls; Home/Settings; screenshots/MCP; ACP/comments; config codemod/project-save backend.
- Review phase made no repository source edits, builds, typechecks, staging, commits or pushes. Tests and probes used existing fixtures or isolated temporary projects. Concurrent dirty work was preserved.
- **Browser evidence** means root exercised current bundled workbench on port 6006. **Mounted evidence** means actual production Vue components/stores or SDK owners ran in an isolated fixture. **Source evidence** means a verified control/data path, without a browser or pixel claim. **Process evidence** uses fake ACP child processes, not credentialed coding agents.
- Relative links identify the reviewed source and line. Ongoing authorized edits can move lines; trigger and owning function/component identify the behavior independently of line numbers.
- All 19 slices received review coverage. No new finding was confirmed for every individual slice; that is not blanket acceptance or a claim that every planned manual gate passed.

## ACP and comments — slices 16, 17

### 1. [P1] Disabling ACP can start a replacement process during teardown

**Closed 2026-10-04:** ACP configuration retires admission synchronously and serializes replacement/teardown. Failed persistence also retires old callbacks and processes. `acp-admission.spec.ts` and independent failed-persistence/process probes pass.

Source: [manager.ts:171](../../packages/histoire/src/node/acp/manager.ts#L171), with record removal at lines 70–74 and admission at lines 82–90.

Trigger: one client disables agents while another submits a prompt during adapter termination. `configure` persists next settings, awaits `stopAll`, then applies settings; the old record is deleted before exit is awaited. A prompt admitted under old enabled settings creates a replacement outside the captured stop set. Disable returns with snapshot disabled while replacement remains alive.

Process evidence: fake ACP peer delays SIGTERM exit by 600 ms. Prompt during disable succeeds, two processes launch, and final disabled manager retains a live process. Fixture manager was then closed. Probe: `/tmp/histoire-review-agents-comments/configure-race-probe.ts`.

Required boundary: retire configuration admission before asynchronous teardown and serialize reconfiguration against starts.

### 2. [P1] Adapter descendants survive stop or indefinitely hold teardown open

**Closed 2026-10-04:** POSIX adapters own a private process group; TERM/KILL escalation and direct-exit/pipe-close waits are bounded independently. `acp-process-tree.spec.ts` and independent descendant/inherited-pipe probes pass on Linux. Windows Job Object and post-crash containment remain unverified; deliberately detached descendants are outside process-group ownership.

Source: [agent-process.ts:19](../../packages/histoire/src/node/acp/agent-process.ts#L19).

Trigger: ACP adapter spawns a worker. Stop signals only adapter PID. With independent worker pipes, worker remains alive after manager closes. With inherited stdout/stderr, direct adapter exits but `close` never arrives; SIGKILL fallback still targets only exited adapter PID, leaving manager teardown unresolved.

Process evidence: Node-only fake adapter and idle worker reproduce both variants. Worker remains alive after close; inherited-pipe close remains unresolved after 1,400 ms despite 1,000 ms escalation. Probes explicitly kill worker and await cleanup: `/tmp/histoire-review-agents-comments/process-probe.ts` and `pipe-close-probe.ts`.

Required boundary: own and stop process descendants, with a bounded pipe-close wait independent of direct child exit.

### 3. [P2] Comment capacity failure loses completed agent result or leaves permanent working state

**Closed 2026-10-04:** Dispatch reserves 24 KiB for a completed reply inside the existing 64-message/48 KiB thread bounds. Oversized replies report truncation; lifecycle recovery needs no extra message slot. Realpath aliases share admission/mutation ownership. `comments-capacity.spec.ts` and independent storage/capacity/alias/shutdown probes pass.

Source: [store.ts:111](../../packages/histoire/src/node/comments/store.ts#L111); limits at [validate.ts:59](../../packages/histoire/src/node/comments/validate.ts#L59).

Trigger: completed agent reply exceeds 64-message or 48 KB thread capacity. Success persistence throws; catch labels it agent failure and attempts another message through the same constrained mutation. That fallback can fail and be swallowed. Thread remains working after agent finished, disabling reply/delete; when fallback fits, successful result is discarded and thread returns to draft with misleading agent failure.

Isolated evidence: 33 successful short calls produce 32 recorded agent replies, 64 messages, and final working status. Valid 8,192-character replies make fifth successful reply disappear into a generic failure. Probes: `/tmp/histoire-review-agents-comments/thread-limit-probe.ts` and `probe.ts`.

Required boundary: reserve or bound history before dispatch, preserve explicit result/capacity information, and let lifecycle recovery complete without another message slot.

### 4. [P2] Unrelated agent completion cancels another agent's permission check

**Closed 2026-10-04:** Permission cancellation uses agent/session generations; global invalidation applies only to global configuration retirement or close. `acp-permission-ownership.spec.ts` and independent concurrent-agent probes pass.

Source: [permissions.ts:54](../../packages/histoire/src/node/acp/permissions.ts#L54), also lines 74–81 and 103.

Trigger: agent B awaits asynchronous `allow-src` confinement check while agent A settles, stops or crashes. One shared revision changes for all agents, including when A has no matching pending cards. B sees mismatch and cancels a valid request.

Isolated evidence: identical permission request for actual `src/button.ts` returns selected normally and cancelled when `broker.settle('agent-A', 'A')` runs during B's check. Probe: `/tmp/histoire-review-agents-comments/permission-scope-probe.ts`.

Required boundary: agent/session cancellation generations, with global invalidation reserved for global closure or configuration retirement.

## Shell and Search — slices 01, 02, 03, 08

### 5. [P2] Narrow Search dismisses before applying Docs intent

**Closed 2026-10-04:** Owned Docs intent completes before narrow dismissal, including docs-only title results. App Markdown transition retains the primary until the existing SDK selection acknowledgment settles; SDK cancellation semantics remain intact. `workbench-search-dismissal.spec.ts`, `workbench-markdown-transition.spec.ts` and final dev/static narrow Docs acceptance pass.

Source: [ShellLayout.vue:40](../../packages/histoire-app/src/app/components/shell/ShellLayout.vue#L40) and [SearchPanel.vue:103](../../packages/histoire-app/src/app/components/panes/search/SearchPanel.vue#L103).

Trigger: at 390 px, open Demo, Search, Docs scope, query `Deserunt`, then activate Docs result. Canonical selection closes narrow pane and unmounts SearchPanel while activation awaits navigation. Completion rejects its own now-inactive owner before applying Docs tab/anchor.

Browser evidence: resulting URL was `/story/src-components-docs-story-vue?variantId`, without `tab=docs`; Props stayed selected. Finish exact owned activation before dismissing pane.

### 6. [P2] Narrow pane removal loses owned keyboard focus

**Closed 2026-10-04:** Removed pane hands focus to its live provider rail without stealing another provider's focus. `workbench-search-focus.spec.ts` and final 390px dev/static Ctrl+K/Escape acceptance pass.

Source: [ShellLayout.vue:60](../../packages/histoire-app/src/app/components/shell/ShellLayout.vue#L60); shortcut ownership at [workbench.ts:126](../../packages/histoire-app/src/app/standalone/workbench.ts#L126).

Trigger: selection removes focused narrow Search/tree pane without focus handoff. Browser evidence after preceding activation: `document.activeElement` was BODY; BODY `Control+k` left Search closed. Provider correctly rejects keyboard events outside its owner, so shortcuts remain unavailable until user refocuses a live control.

Required boundary: restore focus to live owned rail/canvas destination after dismissal, without taking focus from another provider.

### 7. [P2] Search does not dim nonmatching frames

**Closed 2026-10-04:** Active exact-tuple match state dims nonmatching canonical/passive frames and clears on query/source retirement. Ambiguous matrix base tuples are excluded. `workbench-search-frames.spec.ts` and final dev/static Search acceptance pass.

Source: [CanvasFrame.vue:92](../../packages/histoire-app/src/app/components/canvas/CanvasFrame.vue#L92), also line 124.

Trigger: Demo default, Search `message`, Props scope. Only positive highlight is projected; viewport supplies no active-query/nonmatch state. Browser evidence: matching and nonmatching frames both had opacity 1. Plan 08 and supplied Search mockup require nonmatches dimmed.

Required boundary: project match state to canonical and passive frames, clearing it on query reset/source retirement.

### 8. [P2] Planned canvas Search match stepper is absent

**Closed 2026-10-04:** Toolbar exposes match count and Previous/Next; toolbar and Tab reveal/pan matches without mutating SDK selection, preview document or selected frame. Mounted navigation coverage and final dev/static Search acceptance pass. Real inspector-open browser probe also verifies toolbar remains inside available canvas width.

Source: [CanvasToolbar.vue:58](../../packages/histoire-app/src/app/components/canvas/toolbar/CanvasToolbar.vue#L58).

Trigger: active Props Search with matching frames. Toolbar has no count or previous/next match actions, and WorkbenchApp supplies no matching-target contract. Browser AX inspection confirmed absence; only Tab inside Search invokes `nextMatch`.

Required boundary: expose current-story match navigation in toolbar, absent or disabled without matches, retaining canonical selection.

## Canvas, tools and matrix — slices 04, 05, 07, 13

### 9. [P2] Matrix base preset change leaves old variant in frame registry

**Closed 2026-10-04:** registration now follows exact base variant and owned target generation. Unit coverage, actual dev chooser/base-switch probe and fresh dev/static Cypress confirm Alternate cells use Alternate source generation without changing canonical props. See [follow-up validation](implementation-validation.md#2026-10-04-requested-follow-ups).

Source: [MatrixCell.vue:29](../../packages/histoire-app/src/app/components/canvas/matrix/MatrixCell.vue#L29).

Trigger: select matrix cell, change Base preset while axes stay unchanged. Cell key excludes base variant, so mounted registration captures old variant; watcher updates only rectangle while preview remounts with new variant/session.

Mounted evidence: actual component lifecycle and stores, changing first preset to second and flushing twice, retain registry `variantId: first`. Measure is rejected for wrong target; comments/screenshots also receive wrong tuple. Update complete tuple and retire predecessor document/session before successor readiness.

### 10. [P2] Valid long matrix identities exceed preview correlation-ID limit

**Closed 2026-10-04:** override requests use a short owner nonce and counter independent of cell identity. Existing client-ID fallback supports HTTP/LAN contexts without `crypto.randomUUID`. Unit coverage and fresh dev/static Cypress deliver a 500-character finite value into a real passive frame, preserve canonical state and report no cell error. See [follow-up validation](implementation-validation.md#2026-10-04-requested-follow-ups).

Source: [CanvasReplicaPreview.vue:84](../../packages/histoire-app/src/app/components/canvas/CanvasReplicaPreview.vue#L84); runtime bound at [message-handler.ts:42](../../packages/histoire/src/node/virtual/preview-runtime/message-handler.ts#L42).

Trigger: supported matrix string value of 180 characters, or combined long names, yields frame identity longer than 186 characters. Override request embeds full identity; runtime accepts IDs at most 200 characters.

Isolated evidence: actual `matrixCellKey` and generated message handler apply zero overrides for valid cell. Cell times out after three seconds with `Props matrix unavailable in this preview runtime`; retries repeat. Use bounded instance nonce/counter independent of frame identity.

### 11. [P2] Save props as variant emits invalid Svelte markup

**Closed 2026-10-04:** Ready exact-target action uses the owning framework generator/wrapper and hides unsupported capabilities. Svelte titles escape literal braces while preserving decoded title and generated body. `frame-variant-source.spec.ts`, independent real SDK/Vue/Svelte compiler probes and clipboard ownership tests pass.

Source: [frame-actions.ts:140](../../packages/histoire-app/src/app/util/frame-actions.ts#L140).

Trigger: context action on ready Svelte variant. Action always emits Vue `<Variant :init-state="..." />` rather than Svelte `Hst.Variant` syntax and bypasses framework source generator used by separate matrix action.

Isolated evidence: production frame action with real SDK/controller fixture advertising Svelte plugin; installed Svelte 4 compiler rejects copied snippet with `Unexpected token (2:2)`. Use owning framework generator/wrapper or hide unsupported action.

## Inspector, native controls and Markdown — slices 06, 09, 11

### 12. [P2] Unchanged SDK publications disable Source copy and discard comparison body

**Closed 2026-10-04:** Source watches scalar owner fields; unrelated publications retain generated body, copy readiness and comparison content. `workbench-content-ownership.spec.ts` and final dev/static source/theme acceptance pass.

Source: [SourceDrawer.vue:27](../../packages/histoire-app/src/app/components/inspector/SourceDrawer.vue#L27).

Trigger: generate Source, then update unrelated theme. Owner watch returns a fresh array and resets content/previous body despite unchanged source owner. Mounted production component/SDK evidence: source remains visible, Copy source becomes disabled. Prior body is also lost for later generated-source comparison.

Required boundary: watch stable scalar owner fields and invalidate only when actual source ownership changes.

### 13. [P2] Unchanged SDK publications reset Markdown scroll and title metadata

**Closed 2026-10-04:** Markdown watches scalar owner fields; same-document publications preserve scroll, path and fallback title. `workbench-content-ownership.spec.ts` and final dev/static Markdown/theme acceptance pass.

Source: [MarkdownPage.vue:39](../../packages/histoire-app/src/app/components/pages/markdown/MarkdownPage.vue#L39).

Trigger: open docs-only page, scroll to 300, change unrelated theme. Fresh-array owner watch resets loaded/path/title metadata and scroll. Mounted production component/SDK evidence: scroll becomes 0 and fallback title disappears.

Required boundary: preserve same-document state across unrelated snapshot publication.

### 14. [P2] Native prop control ignores runtime finite values

**Closed 2026-10-04:** Native finite editors use the shared validated finite-domain helper and private typed tokens for number/string/Boolean/null. Invalid domains retain free editing. `controls-prop-values.spec.ts` and final dev/static numeric2 preview checks pass; real browser verifies 500-character options stay within inspector while retaining full accessible names.

Source: [PropControl.ts:45](../../packages/histoire-vue/src/components/controls/PropControl.ts#L45).

Trigger: runtime advertises string enum through `PropDefinition.values`. Native prop definition/rendering uses type only, producing unrestricted text instead of finite HstButtonGroup choices.

Mounted evidence: genuine production control cannot find advertised enum choice to select. Retain and map finite-value metadata to appropriate control.

## Home and Settings — slices 10, 12, 19

### 15. [P2] Adding preset silently deletes renamed row

**Closed 2026-10-04:** Local preset additions use stable identities distinct from labels; migration, rename/reuse and project HMR collisions preserve rows. `ui-settings.spec.ts` and `ui-preset-hmr.spec.ts` pass.

Source: [presets-config.ts:83](../../packages/histoire-app/src/app/stores/presets-config.ts#L83).

Trigger: rename project `Phone` to `Mobile`, then add new `Phone`. `put(value.label, ...)` replaces override whose stable key is still `Phone`, deleting visible `Mobile`. Shared implementation affects viewports and backgrounds.

Isolated production-store evidence: expected two rows, actual new `Phone` only. Separate stable source identity from visible label/local addition identity.

### 16. [P2] Home working-tree changes stay stale during story HMR

**Closed 2026-10-04:** Completed collector/list changes invalidate build metadata, generated HMR handlers persist, and subscriptions retire with their provider. Build-info resolved ID matches actual Vite browser hot-context path. `ui-build-info-hmr.spec.ts`, retained-subscription/real Vite coverage and root Home add/edit/remove probe pass without reload.

Source: [collect.ts:195](../../packages/histoire/src/node/server/collect.ts#L195); story-list callback at [server/index.ts:111](../../packages/histoire/src/node/server/index.ts#L111).

Trigger: modify/add/remove story while Home remains open. Completed collection publishes story changes but never invalidates `RESOLVED_BUILD_INFO_ID`; cached Home metadata updates only after reload.

Isolated collector evidence: actual `histoire:story-changed` publication occurs while invalidations omit `\0virtual:$histoire-build-info`. Source confirms story-list callback also omits it. Publish refreshed build info after completed changes, preserving runtime guard and generation timestamp.

### 17. [P2] Density setting has no spacing effect

**Closed 2026-10-04:** Scoped Compact density keeps recycler offsets and row body heights aligned with a 1px gap. Fixed lists flush their public recycler; dynamic lists await documented update events without resetting measurements. `virtual-list.spec.ts`, `virtual-list-dynamic.spec.ts`, `workbench-tree-focus.spec.ts` and final dev/static distant End/Home focus acceptance pass.

Source: [AppearanceSection.vue:51](../../packages/histoire-app/src/app/components/pages/settings/AppearanceSection.vue#L51).

Trigger: select Compact. Setting changes storage and pressed state only. Source search across app/native Vue finds no consumer beyond WorkbenchApp's `data-density`; no CSS consumes attribute. Browser spacing measurements were not performed.

Required boundary: implement scoped density behavior or remove inactive setting.

### 18. [P2] Agent project saves do not retire persisted whole-settings overrides

**Closed 2026-10-04:** ACP persists field-level overrides over current project defaults, conservatively migrates legacy snapshots and retires only verified saved values. New local edits, private environment and unrelated settings survive. `acp-overrides.spec.ts`, `acp-user-data.spec.ts` and independent saved-path/persistence probes pass.

Source: [AgentsSection.vue:57](../../packages/histoire-app/src/app/components/pages/settings/AgentsSection.vue#L57), permissions at line 83; merge/persistence at [manager.ts:65](../../packages/histoire/src/node/acp/manager.ts#L65) and [user-data.ts:43](../../packages/histoire/src/node/acp/user-data.ts#L43).

Trigger: configure a local agent field, save presets/permissions to project, later change project values and restart. Save components handle no saved acknowledgment. Manager replaces project-derived settings with persisted full snapshot, including fields never intentionally overridden.

No-launch manager evidence: configuring only `askEachTime`, then restarting with new project presets and `never/never` permissions, retains old built-ins and `ask/ask`. Probe: `/tmp/histoire-review-agents-comments/persisted-defaults-probe.ts`.

Required boundary: field-level overrides over current project defaults and retirement of only saved paths, preserving unrelated local settings/private env.

## Screenshots and MCP — slices 14, 15

### 19. [P2] MCP reconnect snapshots exceed byte budget despite count bound

**Closed 2026-10-04:** Reconnect snapshots obey the exact final Vite JSON 64 KiB frame budget, omitting whole oldest terminal entries while preserving exact IDs and omission count. `ui-mcp-channel.spec.ts`, `ui-mcp-activity.spec.ts` and independent reconnect/encoding probes pass.

Source: [mcp.ts:27](../../packages/histoire/src/node/server/ui-channel/mcp.ts#L27), also line 34.

Trigger: 50 valid source reads with 2,000-character story IDs. Individual events fit 64 KiB transport limit, retained full snapshot does not. Initial/reconnect/client-change delivery forwards whole array; channel throws and ready callback catches without delivery.

Isolated evidence: actual MCP input schema, observer, context binding and channel fixture validate inputs but reject retained snapshot; subsequent ready sends zero private snapshots. Pane stays unavailable while MCP is enabled. Bound snapshots by bytes or chunk history without truncating target IDs.

### 20. [P2] MCP offers cancellation for read activity with no cancellable operation owner

**Closed 2026-10-04:** Only a real owned execution operation advertises cancellation; reads do not. Explicit rejected cancellation clears pending state and reports failure. MCP channel/activity/store and independent operation-owner probes pass.

Source: [mcp.ts:45](../../packages/histoire/src/node/server/ui-channel/mcp.ts#L45); pending state at [mcp store:46](../../packages/histoire-app/src/app/stores/mcp.ts#L46).

Trigger: async `histoire_get_source`/`histoire_get_docs` read appears running and enables Cancel. Observer's read ID was never admitted to execution operation store, which rejects with `OPERATION_NOT_FOUND`. Channel catches error and returns unchanged snapshot.

Isolated observer/operation-store/client-store evidence: read continues; ID remains cancelling and UI disables button with “Cancelling operation” until read completes, without rejection feedback. Expose actual cancellation capability or route cancellation to request owner with explicit failures.

### 21. [P2] Matrix screenshots discard displayed cell overrides

**Closed 2026-10-04:** Immutable cell frameKey and typed propsOverride travel through capture queue/host and require exact current-document override acknowledgment before rendering/capture. `ui-screenshot-target.spec.ts`, `ui-screenshot-display.spec.ts`, `workbench-screenshot-targets.spec.ts` and final dev real-PNG capture pass. Two exact cells produce 218 changed visible pixels; correlated receipts and byte proof are recorded in repair validation.

Source: [ScreenshotPopover.vue:42](../../packages/histoire-app/src/app/components/canvas/toolbar/ScreenshotPopover.vue#L42), selected target line 44 and payload line 78.

Trigger: select matrix cell whose axis values differ from base, then Screenshot Selected or All. Registry contains base `{ storyId, variantId }`; only visible replica receives `cell.props`. Request/server task carries no cell identity/overrides, so Selected captures base rendering and All repeats base captures with successful-looking cell labels.

Source-verified complete selection/request/server path. No live matrix screenshot or pixel comparison was performed. Support bounded explicit override snapshots or disable matrix capture until supported.

### 22. [P2] MCP canvas cursor is unrelated to operation target and frame geometry

**Closed 2026-10-04:** Follow-enabled cursor requires an owned running exact target and ready physical frame; source/document guards and reactive frame/pan/zoom/resize geometry retire stale overlays. `ui-mcp-cursor.spec.ts`, mounted cursor coverage and independent geometry/ownership probes pass. No live tool-driven cursor-overlay visual claim is made.

Source: [WorkbenchApp.vue:84](../../packages/histoire-app/src/app/components/shell/WorkbenchApp.vue#L84); coordinate default at [AgentCursor.vue:13](../../packages/histoire-app/src/app/components/canvas/AgentCursor.vue#L13).

Trigger: operation targets story A, user opens B, or current activity is queued/targetless. Any `mcp.current` renders cursor without target existence/selection checks or coordinates. Default `(16, 16)` is canvas-relative and ignores frame geometry/pan/zoom.

Source-verified, without live overlay probe. Label falsely suggests client acts on displayed canvas. Guard exact target and map frame-local anchor; generic activity belongs in pane.

## Config editing and project-save backend — slices 18, 19

### 23. [P2] First config creation never restarts runtime

**Closed 2026-10-04:** First owned TS/JS config creation restarts runtime. Serialized byte snapshots deduplicate unchanged add/change pairs while retaining changed-file/missing-file transitions. `config-watchers.spec.ts` and independent actual TS/JS watcher probes pass.

Source: [config-watchers.ts:11](../../packages/histoire/src/node/runtime/config-watchers.ts#L11), registration/events through line 19.

Trigger: start project without Histoire config, then first Save creates one. Watcher registers existing file only and handles `change`, so new config has no watcher. Successful acknowledgment clears local overrides against still-old runtime defaults.

Actual watcher/write boundary in isolated project: file contains saved arrangement and restart count remains 0. No full browser/runtime acquisition was used for this probe. Watch valid missing candidates/add events or own one explicit first-creation restart.

### 24. [P2] Destructured factory binding edits unrelated outer initializer

**Closed 2026-10-04:** Codemod refuses destructured factory shadows instead of editing an unrelated outer initializer. `config-codemod-preservation.spec.ts` and independent original reproduction pass.

Source: [parse.ts:64](../../packages/histoire/src/node/config/codemod/parse.ts#L64).

Trigger:

```text
const scheme = "light"
export default defineConfig(() => {
  const { scheme } = { scheme: "dark" }
  return { theme: { defaultColorScheme: scheme } }
})
```

Declaration collection ignores destructuring, so analysis reports editable through outer `scheme`. Isolated production analysis/edit/evaluation changes outer `"light"` to `"auto"` while actual factory value stays `"dark"`. Mark unsupported shadowing computed rather than editing unrelated binding.

### 25. [P2] Empty inline object insertion deletes existing comment

**Closed 2026-10-04:** Empty literal insertion preserves existing inline comments. `config-codemod-preservation.spec.ts` and independent original reproduction pass.

Source: [source-edit.ts:41](../../packages/histoire/src/node/config/codemod/source-edit.ts#L41).

Trigger: save arrangement into `export default { /* Keep project note */ }`. Empty-container insertion replaces whole inner range. Isolated production edit returns config without comment, violating source preservation. Insert without replacing unrelated comment bytes.

### 26. [P2] Comment before trailing comma prevents safe literal config edit

**Closed 2026-10-04:** Trailing commas and adjacent comments remain editable without comment loss. `config-codemod-preservation.spec.ts` and independent original reproduction pass.

Source: [source-edit.ts:42](../../packages/histoire/src/node/config/codemod/source-edit.ts#L42).

Trigger: append arrangement to `export default { theme: {} /* Keep theme note */, }`. Comma check accepts whitespace only, misses authored comma after comment and inserts duplicate. Isolated production edit fails final parse with `Unexpected token (1:50)`; original remains untouched but valid config cannot be saved. Inspect comma tokens while preserving comments.

### 27. [P2] Save acknowledgment lost during restart leaves persisted local overrides

**Closed 2026-10-04:** Bounded verified save receipts survive intended generation restart through disk/effective-config reconciliation. Browser reconnect recovery reads status without replaying writes, consumes matching saved paths once and preserves newer edits. HTTP-safe UUID fallback retains exact correlations. `config-save-recovery.spec.ts`, `project-config-recovery-client.spec.ts`, `ui-config-channel.spec.ts` and independent restart/recovery probes pass.

Source: [config.ts:181](../../packages/histoire/src/node/server/ui-channel/config.ts#L181), post-write load/ack through line 192; ownership guard at line 140; UI acknowledgment at [SaveToProject.vue:18](../../packages/histoire-app/src/app/components/pages/settings/SaveToProject.vue#L18).

Trigger: existing config has 250 ms top-level await. Save writes watched file, then awaits another load; watcher retires generation before acknowledgment. Actual chokidar/channel/code-loading probe records updated disk, one restart and zero saved acknowledgments.

Client source confirms only acknowledged save emits `saved`; viewport/background sections clear persisted overrides only through that event. Overrides rehydrate after remount and mask later project changes; pending has no disconnect/reconnect recovery. Preserve stale-generation suppression and reconcile completion through new generation or verified project-value reconciliation.

## Executed original review checks

Counts below are per reviewer/check set, **not summed**: sets overlap, notably shortcut and shared UI tests. These are focused current runs, not another full acceptance campaign.

- Shell/foundation/Search: 4 core files/16 tests, tree 1 file/5 tests, native shell 1 file/8 tests passed. Browser proofs cover narrow Docs activation/focus and missing Search frame affordances. Record: `/tmp/histoire-review-shell-findings.md`.
- Canvas/tools: 14 files/64 tests passed; three isolated expected-behavior probes fail for findings 9–11. Probe: `/tmp/histoire-review-canvas-tools/ownership.spec.ts`; review record: `/tmp/histoire-review-canvas-findings.md`.
- Inspector/native controls/Markdown: 12 files/47 tests passed; three mounted production regressions fail for findings 12–14. Probe/log: `/tmp/histoire-review-inspector-tests/review.spec.ts`, `probes.log`; record: `/tmp/histoire-review-inspector-findings.md`.
- Home/Settings: 3 files/13 tests passed; two isolated probes reproduce findings 15–16. Density is source-only; agent persistence uses no-launch manager probe. Logs: `/tmp/histoire-home-settings-review-baseline.log`, `/tmp/histoire-home-settings-review-probes.log`; record: `/tmp/histoire-review-home-settings-findings.md`.
- Screenshots/MCP: 10 files/52 tests passed; real Vite HTTP 1 file/3 tests passed for root/nested-base PNG bytes/MIME, retirement/origin/cleanup. Three isolated assertions pass while demonstrating snapshot/cancellation defects. Logs: `/tmp/histoire-review-screenshots-mcp-{tests,http,probes}.log`; record: `/tmp/histoire-review-screenshots-mcp-findings.md`.
- ACP/comments: 6 files/35 tests passed outside sandbox pipe restrictions. Process/persistence/permission probes reproduce findings 1–4 and 18. In-sandbox `Agent exited (0)` subprocess failures were confirmed environment limitations. Record/probes: `/tmp/histoire-review-agents-comments/`.
- Config codemod/write/channel: 3 files/53 tests passed. Five isolated expected-behavior regressions reproduce findings 23–27 in `/tmp/histoire-config-review/probe.spec.ts` with `/tmp/histoire-config-review/vitest.config.mjs`.

Reviewed boundaries with no additional confirmed defect include shared offline Carbon/font registration, source/theme ownership, catalog tree ordering/focus/storage, canvas Fit/Space/frame-budget/digest guards, canonical/passive state isolation, exact-target message filtering, screenshot execution serialization/cancellation/encoding/path confinement, observer privacy, config allowlists/secrets/conflict backups/rollback, and dev/static gating. This statement covers inspected paths and executed tests only.

## Original review limits and excluded concerns

- No credentialed ACP authentication, real adapter file edits/terminal acceptance or third-party worker-tree behavior was exercised. Confirmed ACP findings use controlled fake processes; test-owned workers were cleaned up.
- At the original review phase, findings 17, 21 and 22 had source evidence only. The later repair campaign adds real density/focus and matrix PNG pixel evidence; cursor ownership/geometry is mounted/behavioral evidence, without a live cursor-overlay visual claim.
- Original read-only reviewers did not run a fresh static book or full acceptance matrix. Root later built the final Vue book and passed all 22 dev/19 static cases in the two workbench suites. No fresh cross-framework full Cypress, 30-variant manual canvas, live stdio, credentialed ACP or full manual acceptance campaign is claimed.
- Pan-to-Select toolbar interception was excluded after root's actual bundled browser probe succeeded. Nested independent theme inheritance, retained per-frame backgrounds after global settings updates, and broader Search metadata lifetime were unverified concerns and are not counted.
- Previous [implementation validation](implementation-validation.md) retains its dated evidence. Passing focused tests and prior captures do not negate reproduced defects or establish a blanket ship verdict.

## Authorized implementation work — separate from read-only review

Separate implementation work authorized in this session covers typechecking repair and specific UI corrections. This section records their status independently of the findings above.

- **Typechecking repaired:** root confirmed app-wide, workbench and embed Vue TypeScript graphs pass. Full app command: `pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/tsconfig.json`. Evidence: `/tmp/histoire-ui-typecheck-full-final.log`, `/tmp/histoire-ui-typecheck-workbench-final.log`, `/tmp/histoire-ui-typecheck-embed-final.log`. Associated focused behavior checks: 4 files/34 tests passed in `/tmp/histoire-ui-typecheck-behavior-tests.log`; not added to review totals.
- **Completed and revalidated:** Tests bulk actions, automatic collection and matching status publication; shared `vue-virtual-scroller` pane/inspector lists with fixed 1px gaps; removal of Stories filter; one-row inspector breadcrumb; preset management menu left of select; padded prop hover; equal toolbar padding; Search alignment; inspector-aware pan hint; persisted pane/inspector resizing; click-locked measurement; automatic matrix discovery. Unnamed catalog groups no longer render empty heading rows at the top of Stories.
- Additional follow-up review reproduced one stale preset acknowledgment bug and three matrix discovery/ownership/HTTP-ID bugs. All four were repaired and rerun with their previously failing independent probes. Actual project Run all also exposed private producer source identity and missing Markdown worker metadata; both now have behavioral regression coverage and successful real project execution. These additional findings are separate from the historical 27.
- Findings 9 and 10 closed during earlier follow-ups. All remaining 25 are now repaired and revalidated with the named closures above and [fresh repair campaign evidence and limits](implementation-validation.md#2026-10-04-remaining-finding-repair-campaign). This closes confirmed findings within executed scope; unexercised platform/manual gates remain explicit.

## Remaining-finding repair campaign

User authorized this campaign on 2026-10-04. Existing dirty work remains preserved; no staging, commit or push is authorized. Each owner reproduces behavioral failures, repairs its bounded files and runs focused tests. Root owns dependency-ordered builds, integration checks, actual browser acceptance and final closure records.

| Findings | Scoped owner | Repair boundary |
| --- | --- | --- |
| 1, 2, 4, 18 | integration_review | ACP admission, descendant cleanup, permission lifetime, field-level persisted settings and saved-path retirement |
| 3 | tests_execution_fix | Comment dispatch capacity, successful-result persistence and lifecycle recovery |
| 5–8 | review_shell_navigation | Narrow Search activation/focus, exact frame dimming and pan-only match stepper |
| 11 | canvas | Framework-owned dynamic variant snippets and stale source suppression |
| 12–14 | review_inspector_tests_docs | Stable Source/Markdown owners and typed finite native prop controls |
| 15–17 | review_home_settings | Preset identity, reactive completed Home HMR metadata, scoped density/recycler sizing |
| 19–22 | toolbar_menu | Bounded MCP snapshots, real cancellation capability, exact matrix capture overrides and cursor geometry |
| 23–27 | review_config_writer | Config watcher/codemod preservation and verified save recovery across restart |

Additional acceptance coverage is owned by preset_menu in a separate Cypress regression file. Shared boundaries are explicit: shell owner owns WorkbenchApp wiring; inspector owner owns the native Vue SFC test compiler setup; config and ACP owners share verified saved-path retirement. Density changes keep fixed recycler height and row CSS in agreement, with the existing 1px item gap.

Campaign complete: all eight scoped implementation owners released source, separate reviewers reran original behavioral reproductions, and root completed final builds, three TypeScript graphs, full affected package tests and both workbench browser suites. Browser-driven follow-ups for docs-only selection lifetime, actual Home HMR routing, recycled focus and long native control/toolbar bounds were also repaired before final acceptance. No staging, commit or push occurred.
