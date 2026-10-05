# Independent Home / Settings / project-save UI review

2026-10-04. Scope: slices 10, 12, UI half of 19. Reviewed current dirty checkout against README refinements, contracts, architecture, slice plans, user docs, and Home/Settings light mockup boards. Historical 27 closures treated as context only.

Outcome: **3 verified P2 findings, 1 verified P3 finding**. No repository source/doc edits, builds, typechecks, browser/Cypress/server operations, or Git writes. Only isolated review files under `/tmp/histoire-ui-review-round-2/settings` and this report were authored. Parent owns browser evidence and integration. Backend config and ACP manager owned by other reviewers.

## 1. [P2] Preset draft indices can overwrite another preset after removal

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/pages/settings/ViewportsSection.vue:25` (tight range 23–25).
Related same defect: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/pages/settings/BackgroundsSection.vue:42` (41–42). Owner capture occurs at Viewports lines 15–17 / Backgrounds lines 26–35; Remove buttons remain available while draft open.

Trigger: presets Phone / Tablet / Desktop. Edit Tablet, rename draft to Tablet revised, remove Phone, submit draft. Draft retains original index 1, now Desktop's index. Actual mounted ViewportsSection + actual createPresetConfigStore yields `[{"label":"Tablet","width":768},{"label":"Tablet revised","width":768,"height":null}]`: Desktop silently lost; original Tablet unchanged. Parallel mounted BackgroundsSection case White / Gray / Black yields `[{"label":"Gray","color":"#888"},{"label":"Gray revised","color":"#888"}]`: Black silently lost. Plain dimension/color edits can instead fail duplicate-label validation after index drift. HMR reordering has same source boundary, though not separately executed.

Impact: unrelated user's preset overwritten; persisted local collection and future Save to project inherit wrong data. Stable identities already protect collection storage, but editor throws that identity away before save.

Fix boundary: retain actual source/local preset identity across edit lifetime; resolve identity again at submit, reject/cancel removed owner, never use captured list index as owner. Reuse collection identity rather than create duplicate identity logic. Regression: mounted draft + preceding row removal, editing row removal, and project-default reorder; assert correct row update and preservation of other rows for both collections. No class/style assertions.

Evidence: `/tmp/histoire-ui-review-round-2/settings/settings-behavior.spec.ts`, first two tests; `/tmp/histoire-ui-review-round-2/settings/probes.log`.

## 2. [P2] Saving another section loses successful unconsumed project-save receipt

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/stores/project-config.ts:99` (99–102). Successful saved paths retained at lines 66–69; only current SaveToProject component consumes them at `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/pages/settings/SaveToProject.vue:17` (17–26).

Trigger: Save viewport override, navigate away before authoritative saved reply, receive successful reply while another Settings section mounted, then save arrangement there before returning to Viewports. Successful first receipt remains submitted because no viewport component consumes it. Second save executes `confirmed.clear()` and overwrites single `submitted` object plus persistence key. Returning to Viewports cannot recover first receipt; path remains locally overridden.

Mounted proof uses actual SaveToProject, createProjectConfigStore, createPresetConfigStore and existing memoryStorage helper. First explicit confirm emits viewport request; section unmounts; matching successful completion received. Arrangement explicit confirm emits different requestId; matching successful completion consumed. On remount, viewport override remains `true`, persisted receipt is `null`, viewport retirement callback called zero times. No writes replayed. Source confirms actual Settings section changes replace component, so no artificial lifecycle precondition required.

Impact: acknowledged settings keep stale browser overrides and hide later project defaults. Contradicts documented retirement across Settings remount. Existing recovery tests cover one receipt and new value edits; they do not cover successful unconsumed receipt followed by second setting save.

Fix boundary: retire matching fields at workbench/store lifetime, independent of mounted section; or retain successful per-path/per-request receipts until consumed instead of replacing them at next write. Preserve comparison against exact submitted local values and preserve edits made after submission. Backend receipt verification need not weaken.

Regression: save viewport, unmount before completion, save arrangement, remount viewport, assert old matching override retired and newer edits retained. Include provider/runtime replacement and denied storage variant.

Evidence: `/tmp/histoire-ui-review-round-2/settings/settings-behavior.spec.ts`, final test; `/tmp/histoire-ui-review-round-2/settings/probes.log` prints `retainedOverride:true, retainedReceipt:null, retired:0`.

## 3. [P2] Settings background swatches bypass checkerboard protocol conversion

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/pages/settings/BackgroundsSection.vue:18` (18–20).

Trigger: configured/local background preset `{label:'Checker', color:'$checkerboard'}`, supported by existing toolbar's backgroundPatch and BackgroundPicker. Click its Settings swatch. Settings submits raw string as CSS background, without checkerboard flag.

Proof: actual mounted BackgroundsSection delegates to real `createHistoireSessionWithAdapters` session using existing sourceFixture and an admitted primary mount. Exact outgoing SDK request is `['settings.update', {responsiveWidth:720,responsiveHeight:null,rotate:false,backgroundColor:'$checkerboard',checkerboard:false,textDirection:'ltr',colorScheme:'auto',globals:{}}]`. Session snapshot also stores invalid CSS sentinel. Existing shared `backgroundPatch('$checkerboard')` produces `{backgroundColor:'transparent',checkerboard:true}`. Request therefore reaches real SDK/transport, not merely a mock assertion. Native visual rendering not measured here.

Impact: preset works through toolbar but fails through Settings; Settings selection also does not consistently clear previous checkerboard mode when choosing ordinary colors. Sentinel is not valid CSS color and flag remains false in reproduced case.

Fix boundary: reuse existing backgroundPatch protocol conversion when applying Settings swatches. Add mounted request regression for checkerboard, normal color after checkerboard, and transparent normal preset; assert outgoing canonical fields, no styles.

Evidence: `/tmp/histoire-ui-review-round-2/settings/settings-behavior.spec.ts`, checkerboard test; `/tmp/histoire-ui-review-round-2/settings/probes.log`.

## 4. [P3] MCP Settings hides available stdio client configuration

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/pages/settings/McpSection.vue:23` (23–30).

Slice 12 explicitly promises MCP snapshot status and copy client config. Current contracts allow missing HTTP endpoint for stdio-only runtime and expose safe stdio metadata. Current producer `/home/akryum/Projects/histoire/packages/histoire/src/node/server/ui-channel/mcp.ts:12` derives command/args from actual Node executable, installed CLI and current project root/config flags; channel snapshot adds it at line 25. Actual producer test `ui-mcp-config.spec.ts` passes and verifies installed CLI file plus exact fields. Store/activity test passes with no endpoint and usable stdio metadata.

Mounted McpSection with this current safe metadata shape and no HTTP endpoint renders only `MCP serverStatusEnabled`, zero copy buttons, no launch config. Entire affordance is conditional on HTTP endpoint and only serializes URL. MCP pane already supports both modes through shared mcpClientConfig/mcpStdioClientConfig, so users can find configuration elsewhere; priority P3.

Fix boundary: reuse existing safe serializers and expose stdio config independent of HTTP endpoint. Regression: actual producer-shaped snapshot without endpoint renders/copies usable command/args; disconnect removes stale config; HTTP still works. No secrets/local env in copy.

Evidence: fourth mounted probe plus `/tmp/histoire-ui-review-round-2/settings/mcp-baseline.log`.

## Executed checks

PATH for commands: `/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.local/share/pnpm/.tools/pnpm/10.33.0/bin:$PATH`.

1. `pnpm --filter histoire exec vitest run src/node/__tests__/ui-settings.spec.ts src/node/__tests__/ui-preset-hmr.spec.ts src/node/__tests__/project-config-recovery-client.spec.ts src/node/__tests__/embed/build-info-subscriptions.spec.ts src/node/__tests__/ui-toolbar-settings.spec.ts --maxWorkers=2`: **5 files / 20 tests passed**. Log: `/tmp/histoire-ui-review-round-2/settings/baseline.log`.
2. `pnpm --filter histoire exec vitest run src/node/__tests__/ui-mcp-config.spec.ts src/node/__tests__/ui-mcp-activity.spec.ts --maxWorkers=2`: **2 files / 13 tests passed**. Log: `/tmp/histoire-ui-review-round-2/settings/mcp-baseline.log`.
3. `pnpm --filter histoire exec vitest run --config /tmp/histoire-ui-review-round-2/settings/vitest.config.mjs --maxWorkers=2 --reporter=verbose`: **1 file / 5 independent behavioral reproductions passed**, meaning they demonstrate observed defects, not that behavior is correct. Log: `/tmp/histoire-ui-review-round-2/settings/probes.log`.

Total: **8 files / 38 tests**, final runs passing. Focused tests never exceed 2 workers. Temporary mounted Vue checks use jsdom, actual SFC compiler and real stores; SDK background case uses real session/request dispatch and existing fixture. No browser/server launched.

Initial temporary harness iterations failed due non-ref snapshot stub / DOM flush ordering; corrected only probe. Importing Node uiStdioConfig directly through jsdom's asset transform caused `The URL must be of scheme file`; producer was instead verified in existing Node focused test, with exact current safe metadata shape mounted separately. This harness mismatch is not a product finding.

## Coverage and limits

Reviewed Home catalog derivation, guides/order/counts/updates, attention rows, build metadata HMR subscription ownership and invalidation source; Settings routes/dev gates, theme/density/local preferences, presets persistence/migration/reset, shortcuts/reference, Tests Watch, MCP/agent UI; project-save provenance, confirmation, manual computed fallback, exact value retirement and reconnect capability.

Current code and focused tests establish retained build-info subscriptions across HMR and provider teardown. Actual Home collector/add/edit/remove routing, dev/static visual acceptance, full static bundle absence, real project write/restart timing, permission/credential subprocess flows and browser clipboard behavior remain parent/other-owner boundaries. No fresh browser or visual equivalence claim. Mockup sample counts/content not treated as requirements. No additional actionable Home, route-gating, density, shortcut, manual-snippet, or agent UI finding confirmed in this scope.

Existing baseline success does not cover draft identity or multiple-section receipt retention; these new probes expose those gaps. Potential corrupt preset duplicate labels, unsupported dimension bounds, offline action feedback and unsaved agent drafts were not independently validated and are not findings. All existing dirty/concurrent checkout work preserved.
