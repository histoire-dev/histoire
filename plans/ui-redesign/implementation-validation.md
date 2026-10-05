# UI redesign implementation validation

Implementation began 2026-10-03. All 19 slice implementations are integrated into the standalone SDK/Vue workbench. This file records executed checks; the separate [acceptance matrix](validation.md) remains the specification.

## Scope and ownership

- Foundation/shell: scoped tokens, licensed local fonts, shared offline Carbon collection, rail/panel/inspector ownership and dev/static gating.
- Canvas/inspector: physical canonical preview, isolated passive frames, pan/zoom, viewport/background tools, measurement, matrix, native controls/docs/events/tests/source.
- Panes/pages: real catalog tree/search/test aggregation, Home metadata, Markdown navigation, Settings and local preferences.
- Dev services: typed UI channel, shared screenshot execution, actual MCP activity, lazy ACP clients, permissions/private environment storage, persisted comments and context.
- Config editing: source-preserving TS/JS codemod and reviewed project settings saves, with computed-value refusal, conflict checks and rollback.

Stores belong to their provider. Canonical selection/runtime state stays SDK-owned; standalone adapters own URL, storage and dev transport. Existing story/plugin syntax and legacy route aliases remain supported. Concurrent SDK, MCP and framework work was preserved; nothing was staged, committed or pushed.

## Executed automated checks

Commands use installed Node 24.16.0 and pnpm 10.33.0 binaries; shell shims cannot write their runtime state in this sandbox.

| Check | Latest completed result | Evidence |
| --- | --- | --- |
| Dependency-ordered build of protocol/shared/SDK/controls/Vue/app/core and Vue/Svelte/Nuxt/React plugins | 11 packages pass | `/tmp/histoire-ui-acceptance-build.log` |
| Full core unit suite | 242 files, 1,153 tests pass | `/tmp/histoire-ui-acceptance-core.log` |
| SDK and native Vue suites | 27/41 files, 133/172 tests pass | `/tmp/histoire-ui-acceptance-packages.log` |
| Protocol and controls suites | 13/6 files, 43/20 tests pass | `/tmp/histoire-ui-acceptance-packages.log` |
| Co-located tree/Home/Markdown/search tests | 6 files, 21 tests pass | `/tmp/histoire-ui-pages-verified-tests.log` |
| Mounted workbench Vue TypeScript graph | Pass, including standalone entry and all new surfaces | `/tmp/histoire-ui-workbench-typecheck.log` |
| Full app, workbench and embed TypeScript configs (2026-10-04) | All three pass with zero diagnostics | `/tmp/histoire-ui-typecheck-{full,workbench,embed}-final.log` |
| Typecheck repair regression coverage (2026-10-04) | 4 files, 34 tests pass; scoped ESLint passes | `/tmp/histoire-ui-typecheck-behavior-tests.log`, `/tmp/histoire-ui-typecheck-lint.log` |
| App build after full typecheck repairs (2026-10-04) | Pass | `/tmp/histoire-ui-typecheck-app-build.log` |
| Repository ESLint | 0 errors, 43 warnings | `/tmp/histoire-ui-acceptance-lint.log` |
| VitePress documentation build | Pass | `/tmp/histoire-ui-docs-final-build.log` |
| Vue dev Cypress coverage | Full run 65/70; corrected helpers rerun 27/27 (11 Codegen, 2 previews, 14 workbench contracts), covering all five former failures | `/tmp/histoire-ui-vue-dev-final.log`, `/tmp/histoire-ui-vue-dev-repaired.log` |
| Final static Vue book | Build passes; full Cypress 62/68, 3 helper failures and 3 expected dev-only skips; affected Stories/preview checks repaired 4/4 | `/tmp/histoire-ui-vue-static-final.log`, `/tmp/histoire-ui-vue-static-repaired.log`, `/tmp/histoire-ui-vue-static-preview-diagnostic.log` |
| Final static Svelte book and full smoke suite | Build passes; 12/12 Cypress cases pass | `/tmp/histoire-ui-svelte-static-build.log`, `/tmp/histoire-ui-svelte-static-final.log` |
| Final static Nuxt book and full smoke suite | Build passes; 12/12 Cypress cases pass | `/tmp/histoire-ui-nuxt-static-build.log`, `/tmp/histoire-ui-nuxt-static-final.log` |

Final bundles include iframe reload/passive-state repairs and final visual corrections. The five dev browser failures were four readiness timeout propagation failures and a disabled Measure label selector; helper fixes preserve exact source and readiness assertions. Static Vue helper repairs read the built catalog endpoint and reacquire canonical readiness after explicit frame selection. Fresh multi-variant stories deliberately open an unselected chooser, so waiting for a canonical iframe before selecting a frame is invalid. Repaired preview assertions pass without app changes. No source failures remain in these browser checks. The full Vue runs and focused repairs are separate evidence; neither original full run is claimed to have passed completely.

Static workbench contracts record and reject Iconify/Google Fonts requests; zero external attempts occurred, including Vue's real HstSelect controls interaction. The Svelte 4 example's existing preprocess configuration now sets TypeScript 6 `ignoreDeprecations: "6.0"`, allowing the unchanged legacy compiler options to build. All test-owned preview/Cypress processes stopped; the final dev preview remains available on port 6006.

Baseline checkout already contained extensive dirty source/tests. Initial runs overlapped agents' test-first work and are not a clean historical baseline. Original Vue specs referenced removed panels/modals and initial Source visibility; adaptations retain state, code generation, docs, events, HMR and overlay assertions using new shell navigation.

## Browser and design evidence

Supplied extracted PNGs in [Histoire UI Refresh-png](<Histoire UI Refresh-png/>) are visual authority. Sample Acme titles, counts, agent activity and component variants were replaced with real example data.

- Actual dev workbench runs with bundled app at `http://localhost:6006`.
- Primary capture set covers Home, Story and Settings in light/dark at 1440×900 and 390×844, plus narrow inspector-open/closed states. Independent finish review cleared all five initial findings: rail reachability, bounded toolbar, dark accent, inspector typography and default Browse label.
- Additional captures cover matrix, Search, Tests, Docs, Markdown, Events, Source, MCP, comments, comment composer, screenshot inventory, ACP settings and context menu. Independent final review cleared Search row topology, temporary draft anchor, screenshot popover placement and Recent file findability in both themes. Matrix/Markdown/populated Events pairs have no material visual blockers. Capture review does not claim runtime acceptance.
- All 41 browser captures and safe MCP proof are preserved in `/home/akryum/.codex/visualizations/2026/10/03/01a10339-5d01-7cf2-91f6-4916c5d5cb45/histoire-ui-redesign/`. Static Home light/dark pair also passed supplemental visual review.
- Actual MCP SDK client named `UI validation` called `histoire_get_project`, `histoire_list_stories` and `histoire_get_story` against port 6007. Parent browser confirmed real completed history and client labels; client closed cleanly. Safe proof: `/tmp/histoire-ui-live-mcp-proof.jsonl`.

[PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md) and [.impeccable/design.json](../../.impeccable/design.json) record product constraints and actual reused design tokens/components.

## Behavioral repairs found during integration

- Matrix option belongs only to runtime mount URL, preserving strict public source URL validation.
- Screenshot and private environment HTTP routes register before Vite history fallback; actual image bytes, MIME, nested base and origin rejection are tested.
- Same-story standalone variant changes preserve runtime-owned state while selection-version guards reject stale acknowledgments and mutations.
- Native automatic prop inputs display collected values and retain newest local typing until ordered acknowledgments arrive; sibling edits merge without lost updates.
- Public event callbacks use runtime-owned publication with exact document/selection identity.
- Local bridge advances matching source revision before synchronous collection requests during catalog publication.
- Docs-only omitted/synthetic variants normalize to canonical `null` selection, including history/hash navigation.
- Matrix fit waits for measured viewport, reserves fixed chrome and preserves explicit zoom; zooming does not retrigger selection focus.
- Selected matrix cells own canvas measurement targets without changing canonical SDK selection.
- Canonical edits seed passive previews for the exact unchanged story generation; stale catalog/runtime state cannot seed successor frames.
- First iframe load preserves SDK mount readiness. Later physical reloads restore current variant intent and reject predecessor messages, including selection changes before the first load.
- Git metadata normalizes repository-relative paths for nested project roots, including renamed/newline filenames.
- Static inspector hides Tests and falls back from old `tab=tests`; static config omits private/dev agent and comment settings.
- Shared built-in controls use the same offline Carbon assets as workbench; no built-in Iconify fetch remains.

## Limits

Real ACP authentication and live file/terminal permission acceptance were not exercised. No real agent was launched. Official ACP SDK integration is verified with real child-process fixtures, handshake, sessions, permission requests, timeouts, cancellation and redaction; this does not establish third-party adapter behavior under user credentials.

On 2026-10-04, full app, mounted workbench and embed configs all pass `pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/<config>`. The app-wide repair uses bundler resolution, explicit RouterLink destination props, shallow search result lists, missing tree types and the existing collected `Story.docsText` contract. No exclusions or weakened checks were added. These results supersede the earlier app-wide diagnostic limitation.

Independent implementation reviews on 2026-10-04 found behavioral gaps beyond previous passing coverage. See [implementation review](implementation-review.md) for original findings/reproductions and named closures. Earlier passing builds and captures did not clear those findings; the [remaining-finding repair campaign](#2026-10-04-remaining-finding-repair-campaign) supplies fresh closure evidence. Later user-requested test performance/list and UI refinements are recorded below with their own evidence.

`HISTOIRE_DEV=true` source-development startup encountered a Vue StyleIsolation/Tailwind fixture issue; normal bundled `histoire dev` and static builds are the acceptance paths used here. No production deployment, CI run or publishing was requested.

## 2026-10-04 requested follow-ups

These results supersede earlier limitations for the named paths. Original full-suite evidence above remains dated; it is not silently upgraded by focused reruns.

### Implemented behavior

- Project Run all uses one shared server admission and one browser collection for the project. Watch batches one run per changed story. Results publish in batches with exact source epoch/revision and target provenance; selected inspector automatically collects when its preview becomes ready and receives matching project/preview statuses and definitions. Vitest keeps its existing file parallelism and execution ownership.
- Real execution exposed two producer defects: private catalog source IDs made portable SDK rows reject valid results; isolated test IPC omitted Markdown associations and adjacent lookup targets. The producer now uses portable source identity, and a detached acyclic file DTO reconstructs Markdown links in the owned worker. No rescans or extra workers were introduced.
- Stories, Search results/commands, Tests targets, Comments, MCP clients/history and native Events/Tests use one shared `vue-virtual-scroller` surface. Fixed rows use `RecycleScroller`; variable content uses `DynamicScroller`. Recycled controls retain exact keys, inactive slots render no retained content, keyboard reveal resolves current keys, and every row reserves 1px gap. Empty catalog group titles no longer produce blank heading rows. Stories filtering was removed; Search owns filtering.
- Inspector breadcrumb uses one line. Preset management is a keyboard-accessible menu left of the select; name entry stays inside the menu. Rename/Delete cannot modify Initial state. Source retirement rejects predecessor acknowledgments; apply/reset selection changes after acknowledgment. Prop hover backgrounds reserve 8px without shifting input layout.
- Search input and scope strip share bounds; scope/tab item gaps are 1px. Toolbar button insets match. Canvas title stays on one line and file metadata truncates before it crowds the title; matrix axes clear the heading. Pan hint centers within canvas space left by the visible inspector.
- Pane and inspector have pointer/keyboard resize handles, persisted widths, narrow bounds and canvas clearance. Measure click freezes the displayed box, a second click unlocks it, and tool/frame/document/source ownership changes clear it. Canonical SDK state is not changed by measuring.
- [Extension 20](20-matrix-auto-detection.md) was planned by one subagent and implemented by another. Boolean props and validated finite runtime `values`/`enum` metadata supply axes; explicit matrix hints remain overrides. Existing ordinary previews supply chooser metadata for the exact first variant, with detached generation-scoped retention. Direct Matrix chooser entry/reload keeps ordinary Grid until proven axes arrive, retaining URL/toolbar/inspector intent, then automatically renders Matrix. Empty filters do not trigger bootstrap. Canonical fresh metadata wins; overridden matrix cells cannot feed discovery. Base registry target follows preset changes; override requests use bounded opaque IDs with the existing HTTP-safe ID fallback. TypeScript unions without finite runtime metadata remain unsupported.

### Fresh automated evidence

| Check | Executed result | Evidence |
| --- | --- | --- |
| Dependency-ordered build | All 11 packages pass | `/tmp/histoire-ui-followup-final-build.log` |
| App/core rebuild after list, test producer and Markdown IPC repairs | Pass | `/tmp/histoire-ui-followup-repair-build.log` |
| Final app/core build after chooser bootstrap | Pass | `/tmp/histoire-ui-followup-bootstrap-build.log` |
| Final static Vue build after chooser bootstrap | Pass; static book collects 42 story files / 1,091 variants | `/tmp/histoire-ui-followup-bootstrap-static-build.log` |
| Full app/workbench/embed Vue TypeScript configs after chooser bootstrap | All three pass, zero diagnostics | `/tmp/histoire-ui-followup-final-typecheck-{full,workbench,embed}.log` |
| Full native Vue suite after chooser bootstrap | 50 files / 215 tests pass | `/tmp/histoire-ui-followup-vue-tests-bootstrap-final.log` |
| Full protocol suite | 13 files / 44 tests pass | `/tmp/histoire-ui-followup-protocol-tests-final.log` |
| Focused core measure/ownership/frame/matrix/override/test-runner coverage | 8 files / 33 tests pass | `/tmp/histoire-ui-followup-core-tests.log` |
| Latest test producer, Markdown IPC/renderer, targeting, harness and workbench runner | 5 files / 19 tests pass | `/tmp/histoire-ui-followup-backend-tests-final.log` |
| Vue dev workbench acceptance after chooser bootstrap, including reload | 15/15 pass | `/tmp/histoire-ui-followup-bootstrap-dev-cypress.log` |
| Final static Vue workbench acceptance, including chooser reload | 13/13 pass | `/tmp/histoire-ui-followup-bootstrap-static-cypress.log` |
| Repository ESLint after follow-up implementation and documentation | 0 errors, 43 existing warnings | `/tmp/histoire-ui-followup-final-lint.log` |
| VitePress documentation build | Pass | `/tmp/histoire-ui-followup-final-docs-build.log` |

The first sandbox full Vue/protocol runs each hit one `spawnSync EPERM` in their real emitted-package import contract. Both full suites were rerun outside that process restriction and passed; only those completed reruns are listed. Initial dev acceptance had one stale Props-group selector after list flattening; it now asserts exact `data-search-kind="prop"` row identity. The fresh full 15-case rerun passes. No retry was used in the listed follow-up Cypress runs.

Behavioral tests cover stale preset commands, measured row expansion/recycling/focus, exact test provenance, pending/source lifetime, axis fallback/hint priority, preserved filters, strict finite domains and long correlation identities. Independent follow-up review reran previously failing preset and matrix probes after repairs. CSS presentation was checked in the real browser rather than encoded as class/style unit assertions.

### Real browser evidence

- Actual Run all, after producer/Markdown fixes: **9 passed, 0 failed, 2 skipped in 11.9s**, across **1,089 variant targets**. One browser collection and one Vitest project run were observed. Selected Lifecycle inspector showed five collected/passing cases; switching to the exact recycled Mocking target showed its own two passing/one skipped cases. Running selected preview updated both inspector and project row. This is one observed execution, not a performance benchmark.
- Project Tests rendered 20 active rows for 1,089 targets; expanded HugeGrid Stories rendered 35 active rows for 1,000 variants. Scrolling and activating a recycled row navigated its exact target. An independent mounted probe of installed DynamicScroller 3.0.5 grew content from 31px to 151px, measured 32px/152px including the 1px gap, revealed/focused distant row 999 and then row 0, and rejected retired pooled identities.
- No-hint chooser enabled Matrix before selecting a canonical variant. All four Boolean combinations rendered real iframe content; changing Base preset used Alternate across cells and copied Alternate source. A 500-character finite override reached the real frame while canonical Grid props remained unchanged. Final dev Cypress and actual static direct-entry/reload probes also preserve null variant and automatically recover four real cells after ordinary-preview discovery. Root's initial post-fix probe expected Boolean cells while its own previously saved Tone axis was restored; exact DOM showed four valid Tone cells. Restoring Rows to enabled resolved the probe expectation without source changes.
- Measure click displayed **720 × 640 Locked**; moving interaction to Stories retained it. Second click unlocked it; tool change cleared it. Static browser repeated click locking on the actual selected matrix replica.
- Pane/inspector keyboard and pointer resize changed actual widths, survived reload, and remained bounded at 700px and 390px overrides. At 390px, document scroll width matched client width. Test widths were restored to 280px/344px. Inspector-aware pan hint ended before the inspector edge.
- Search field/scope bounds matched. Inspector prefix and title shared vertical bounds. Toolbar first/last button insets measured approximately 7.93px each. Unnamed heading count is zero; Introduction begins at the tree top and MarkdownLinks follows with the expected 1px gap.
- Current proof captures are in `/home/akryum/.codex/visualizations/2026/10/03/01a10339-5d01-7cf2-91f6-4916c5d5cb45/histoire-ui-redesign/`: `followup-stories-spacing-light.png`, `followup-stories-spacing-dark.png`, `followup-tests-light.png`, and `followup-matrix-locked-static-{light,dark}.png`.

Matrix review findings 9 and 10 are closed with named evidence in [implementation review](implementation-review.md). At this earlier follow-up checkpoint, 25 historical findings remained pending, including both ACP P1 findings. The later [remaining-finding repair campaign](#2026-10-04-remaining-finding-repair-campaign) repairs and revalidates all 25. No fresh full framework campaign, credentialed ACP adapter, production deployment or CI run is claimed. New Vue matrix behavior has real dev/static acceptance; Svelte/React Boolean fallback has focused source-level coverage, not a new cross-framework browser result. Source/HMR ownership and HTTP-ID fallback are behavioral-test evidence, not a fresh browser HMR/LAN campaign.

Final test-owned static preview stopped; completed Cypress/worker processes closed. Temporary browser viewport override was reset and agent-created validation tab closed. User-owned browser tabs were preserved. Normal bundled development preview remains available on port 6006. Nothing was staged, committed or pushed.

## 2026-10-04 remaining-finding repair campaign

User authorized all 25 remaining findings. Eight scoped implementation owners fixed them; separate reviewers reran failing reproductions. Root integrated shared contracts and owned dependency-ordered builds, servers, browser acceptance and final records. All 27 historical findings now have named closure evidence in [implementation review](implementation-review.md). Earlier campaign counts remain historical and are not added to these totals.

### Final automated evidence

Logs below live under `/tmp/histoire-ui-review-repairs/`. Completed runs use final source/artifacts for their affected graph; later CSS-only toolbar/prop alignment changes are covered by the final app build and browser suites.

| Check | Final executed result | Log |
| --- | --- | --- |
| Dependency-ordered packages | All 11 packages built; affected shared/Vue/app/core packages rebuilt after integration | `build.log`, `build-accepted.log`, `build-backend-plugins.log`, `build-browser-final.log`, `build-list-accepted.log`, `build-toolbar-final.log` |
| Core full suite | 261 files / 1,259 tests pass | `core-tests-accepted.log` |
| Protocol / SDK full suites | 13 files / 44 tests and 27 files / 133 tests pass | `package-tests.log` |
| Controls / native Vue full suites | 7 files / 21 tests and 58 files / 249 tests pass; no unhandled errors | `native-tests-final.log` |
| Shared offline icon regression | 1 file / 2 tests pass | `icons-final.log` |
| Full app / workbench / embed TypeScript | All three graphs pass, zero diagnostics | `typecheck-{full,workbench,embed}-accepted.log` |
| Repository ESLint | 0 errors, 43 existing warnings | `lint-final.log` |
| Final static Vue book | Pass; 42 story files / 1,091 variants | `static-build-final.log` |
| Final dev workbench browser suites | 22/22 pass, retries=0 | `dev-cypress-pass.log` |
| Final static workbench browser suites | 19/19 pass, retries=0 | `static-cypress-pass.log` |
| Final VitePress documentation build | Pass | `docs-build-final.log` |

Core, protocol, SDK, controls and native Vue checks use their existing package `test` scripts. Typechecking uses `pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/<config>` for `tsconfig.json`, `tsconfig.workbench.json` and `tsconfig.embed.json`. Browser command, from `examples/vue3`: `pnpm exec cypress run --spec cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js --config baseUrl=<dev-or-static-url>,retries=0 --env workbenchMode=<dev-or-static>`. Dev uses port 6006; static uses port 4567. Static omits the three dev-only operations by explicit mode.

A build/test overlap removed emitted workers during an earlier core run; root discarded that invalid run and completed the isolated 1,259-test run above. Earlier browser failures exposed real Docs-only selection lifetime, long finite-control overflow and recycled keyboard focus bugs; these were fixed before final acceptance. Test setup corrections retain intent: hidden heading permalink is accounted for with exact `h1#welcome`; Search stepping starts with an offscreen match; capture popover closes before selecting the next cell. No force click, assertion weakening or retry increase was used. Earlier partial runs are not claimed as passes.

### Added behavioral boundaries

- ACP configuration closes admission before asynchronous stop and serializes starts/reconfiguration, including persistence failures. Permission generations are agent/session scoped. POSIX process groups and bounded exit/pipe escalation retire controlled descendants. Field-level overrides preserve private/local settings and retire only matching verified saved values.
- Comment admission reserves completed-reply capacity, preserves bounded history, reports explicit truncation and allows status recovery without another message slot. Realpath aliases share admission and mutation lanes.
- Search applies Docs intent before dismissal, restores owned rail focus, dims exact nonmatches and pans matches without changing canonical state/document. Docs-only Markdown layout waits for the existing SDK selection acknowledgment before retiring the primary. Query/source/generation guards suppress retired errors.
- Source and Markdown retain content/scroll/title across unrelated publications. Native finite controls preserve exact value types and reject invalid domains; long labels remain bounded with full accessible names. Inspector Boolean metadata and controls occupy separate normal-flow space.
- Presets retain stable identity across rename/reuse/HMR. Home build-info invalidation uses the actual browser hot-context path. Compact spacing preserves 1px gaps and measured dynamic rows; keyboard reveal/focus uses only installed scroller public capabilities with source/key/lifetime guards.
- Framework variant export uses exact current target and installed generators; Svelte literal title braces remain valid markup. Toolbar host uses actual canvas width remaining beside inspector, so selection and match controls stay reachable.
- MCP snapshots obey the exact encoded transport budget and preserve full IDs. Cancellation reflects actual owned operations and rejected requests clear feedback. Cursor follows only an exact running target with current physical-frame geometry. Matrix capture retains immutable cell identity/typed override and awaits exact document acknowledgment before capture.
- Config watchers restart first TS/JS creation and deduplicate identical bytes; codemods refuse destructured shadows and preserve comments/trailing commas. Verified bounded save receipts reconcile across intended restart, never replay writes, preserve newer edits and retain HTTP-safe correlation IDs.

### Fresh real browser and pixel evidence

- At 390px, Docs Search activation finishes `tab=docs`, closes the narrow pane and restores rail focus; Ctrl+K reopens Search and Escape restores focus. Both ordinary Docs and docs-only MarkdownLinks pass. Explicit `#welcome` deep-link survives local anchor interaction and dismissal. Native docs anchors intentionally scroll locally without changing host URL; mounted tests separately cover supplied Search anchors.
- Canonical and passive frames dim correctly; toolbar Previous/Next pans offscreen matches while selection URL and preview document stay unchanged. At 1200px with 280px Stories and 344px inspector, toolbar fits the available canvas, its Select control remains visible, and both directions are reachable.
- Numeric finite button2 reaches the actual preview as `data-level=2`, `data-level-type=number`. A 500-character option stays inside the 344px inspector: client width equals scroll width. Final screenshot `workbench-final.png` shows bounded toolbar, single-row breadcrumb, preset menu location, padded/native typed controls and populated Stories without the empty heading gap.
- Fixed Compact list reveal reaches exact row999 then row0 with focus retained and bounded row DOM. Independent installed DynamicScroller delayed-native-scroll coverage preserves measured heights, reveals/focuses the exact distant row and cancels removed/unmounted owners.
- Retained Home document follows guarded story addition, title edit and removal without navigation/reload: Search counts41/5 to40/5 and Components34/1055 to33/1054; Changed tile appears, renames and disappears. Root proof: `home-hmr-proof.md`. Temporary fixture was removed. `home-hmr-live.png` shows context only; the tile was below its viewport.
- Dev capture records two exact Default-base matrix cells with `enabled=false` and `emphasized=false/true`. Exact frame keys and typed overrides are correlated to real PNG bytes/MIME. Both images decode720×640; RGBA buffers differ at218 pixels, with218 pixels also visibly different when composited over white, bounds(361,33)–(392,44). `matrix-pixels.json` records paths, hashes and receipt identities. This establishes actual displayed-cell capture differences, beyond successful request labels.

### Remaining verification limits

Credentialed ACP authentication, live third-party adapter edits/terminal approvals and Windows Job Object/post-crash containment were not exercised. Linux fixtures prove controlled process-group cleanup; deliberately detached descendants remain outside that ownership. Cursor has mounted exact-target/geometry proof, without a fresh live tool-driven overlay visual claim. No new full cross-framework Cypress campaign, CI, deployment or publishing was requested. Unsupported automatic source-generator capabilities remain hidden. These limits do not reopen the repaired findings within their tested scope.

Normal final bundled dev preview remains on port6006. Test-owned static preview and agent-created browser tab are closed after acceptance; temporary viewport override is reset, user tabs preserved. Nothing was staged, committed or pushed.

## 2026-10-04 round 2 repair campaign

User authorized Terra xhigh repairs for all 27 findings from [fresh review round 2](implementation-review-round-2.md): 1 P1, 20 P2, 6 P3. Eleven implementation owners fixed non-overlapping scopes; independent follow-up review checked the repaired contracts and additional edges. [Closure ledger](implementation-repair-round-2.md) records every finding, owner, source boundary and durable regression. Earlier review/repair evidence remains historical and is not added to these totals.

### Final automated evidence

All logs below live under `/tmp/` with prefix `histoire-ui-round-2-`. Package checks use existing scripts with at most two Vitest workers per invocation. Real child-process and localhost fixtures ran outside the process/port sandbox restriction.

| Check | Final executed result | Log suffix |
| --- | --- | --- |
| Dependency-ordered affected builds | Protocol, shared, SDK, controls, native Vue, app, core and Vue plugin built; final app and backend builds passed | `build.log`, `build-backend.log`, `build-app-final.log` |
| Full core suite | 262 files / 1,291 tests passed | `core-tests.log` |
| Full native Vue suite | 63 files / 272 tests passed, including mounted keyboard lifecycle and framed-host ownership | `vue-tests-accepted.log` |
| Full SDK suite | 27 files / 133 tests passed | `sdk-tests.log` |
| Full protocol suite | 13 files / 44 tests passed | `protocol-tests.log` |
| Full controls suite | 7 files / 21 tests passed | `controls-tests.log` |
| Full app/workbench/embed TypeScript | All three graphs passed, zero diagnostics | `typecheck-{full,workbench,embed}-final.log` |
| Repository ESLint | 0 errors; 43 warnings retained | `lint-accepted.log` |
| Static Vue book | Built 42 stories / 1,091 variants | `static-build.log` |
| Final dev browser suites | 27/27 passed, retries=0 | `dev-cypress-final.log` |
| Final static browser suites | 24/24 passed, retries=0 | `static-cypress-accepted.log` |
| VitePress documentation build | Passed after closure records and public codemod contract update | `docs-build.log` |

Five full package runs total **1,761 tests in 372 files**. This sum counts these executed package cases only; focused owner/reviewer runs overlap and are not added. It does not include excluded integration/consumer campaigns or other framework packages.

Commands: `pnpm --filter <package> test --maxWorkers=2` for `histoire`, `@histoire/vue`, `@histoire/sdk`, `@histoire/protocol`, `@histoire/controls`. Typechecking: `pnpm --filter @histoire/controls exec vue-tsc --noEmit -p ../histoire-app/<config>` for `tsconfig.json`, `tsconfig.workbench.json`, `tsconfig.embed.json`. From `examples/vue3`, browser command: `pnpm exec cypress run --spec cypress/e2e/ui-round-2-regressions.cy.js,cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js --config baseUrl=<dev-or-static-url>,retries=0 --env workbenchMode=<dev-or-static>`. Dev port6006; static port4567. Static omits three dev-only cases by explicit mode.

The first dependency build exposed an ACP secret-aggregation type inference error; explicit environment/Set string types fixed it before final core/plugin build. After browser follow-up, app was rebuilt and all three TypeScript graphs rerun. Final full native Vue rerun includes the added mounted listener regression. Core process fixtures ran against final backend artifacts; no emitted backend build overlapped that full core run.

### Browser findings and final proof

- Matrix pointer context menu, Shift+F10 and ContextMenu key open exact ready-cell actions without changing canonical URL or selected cell. Keyboard Escape restores exact cell focus.
- With Measure enabled, hand, middle mouse and held Space each move selected cell by 48px/32px in dev and static browser regression. Pan-generated primary click leaves Measure unlocked; next ordinary click locks and second unlocks. Middle gesture does not consume the next ordinary lock click.
- Root native browser drag independently moved real selected Matrix bounds from x496.934/y307.193 to x541.937/y342.188: **45.003px/34.994px**. Measure remained unlocked. This is an actual physical drag, separate from Cypress's synthetic pointer routing checks.
- Browser integration found same-document Space ownership broken when Histoire lived inside an outer host iframe. Production now keeps canvas chrome local to `root.ownerDocument`, mapping only foreign preview documents through their iframe. A nested-host-frame regression failed before repair; mounted window listener and framed ownership checks now pass.
- The remaining Cypress Space failure was a harness targeting error: actionability retargeted canvas-center KeyboardEvent to covering `Select matrix cell false · true` button. Diagnostic trace recorded that actual event target. Test now checks canvas focus and bypasses hit testing only for synthetic keyboard dispatch, preserving ordinary native Space activation on buttons. Client-pixel pan and lock assertions remain unchanged. Pointer events are synthetic routing probes; no forced user click, retries or assertion weakening were added.
- Other harness corrections match real affordances: Copy source menu text includes its shortcut suffix; Markdown Copy link is an icon button selected by its exact accessible label. Final dev/static copied-anchor test asserts exact clipboard API argument including `#welcome`, with unchanged host URL. Clipboard API is stubbed in that assertion; browser-use virtual clipboard could not inspect real copied text, so no live clipboard-read claim is made.
- Real Search ArrowDown produced AX announcement `untitled, variant result, 2 of 45` while input retained focus. Mounted coverage includes variants, Docs, commands and distant recycled result ownership. This is browser AX evidence, not a screen-reader usability test.

Final menu capture: [round-2-matrix-menu.png](/home/akryum/.codex/visualizations/2026/10/03/01a10339-5d01-7cf2-91f6-4916c5d5cb45/histoire-ui-redesign/round-2-matrix-menu.png). Captured from final rebuilt bundled dev UI using keyboard frame-menu activation; inspector shows no selected cell, demonstrating menu activation does not select a cell. Earlier review image under `/tmp/histoire-ui-review-round-2/measure-pan.png` records the original failure and is not after-repair proof.

### Scope and cleanup

ACP credential collision/rotation uses actual controlled Linux child processes and fake credentials. Screenshot budget tests use actual channel/schema/file receipts with controlled valid PNG/browser fixtures. Execution cancellation/catalog tests use real lanes and controlled runners. These establish their stated contracts, not live credentialed adapter permission/authentication, Windows process containment, external connected MCP, a new full cross-framework campaign, CI or deployment.

Test-owned static preview and temporary browser proof tabs closed after acceptance. No viewport override was introduced in this campaign. User tabs preserved; normal final bundled dev preview remains on port6006. Nothing was staged, committed or pushed.

## 2026-10-04 C1 shared-controls implementation

`@histoire/controls` now owns C1 controls used by workbench, native Vue panels and public story controls. Controls share fields, neutral segments, switches, buttons, menus, typography, focus and disabled states. Preview content retains its styling.

### Implementation and compatibility

- Shared foundation ships in vendor and peer CSS. Manrope and JetBrains Mono assets, declarations and licenses moved to controls; app font generation/copying consumes that source. Both CSS entrypoints include fonts. Peer JavaScript remains free of stylesheet/theme side effects; standalone controls have no owned global body typography rule.
- Added stacked/horizontal/inline layouts, native field attributes/listeners, search/password types, focus/select handles, label associations and wrapper metadata. String viewport drafts preserve Auto behavior; numeric state uses numeric controls. Clicking field preserves caret; label interaction retains selection.
- Added public `HstSwitch`, automatic Boolean switch editing, numeric segmented values and disabled select options. Select normalization/focus helpers serve local and host menus; opaque IDs preserve exact values/object identity. Slots remain local. Disabled host results are rejected again by sandbox callback.
- Checkbox Boolean/string compatibility, native radio/list groups, slider/color contracts and real CodeMirror JSON drafts remain intact. Readonly/disabled editor compartments block edits without replacing editor.
- Migrated native presets, inspector/matrix, Settings/ACP, canvas tools, search/commands, comments, panes, rail/Home/menu actions and retry controls. BaseSelect/BaseCheckbox/BaseButton are shared-control adapters preserving events, slots and links. Typed finite matrix values, local overrides, async acknowledgements, pending locks and stale-owner checks remain.
- Appearance projection copies finite shared palette/density/font variables only. Provider-local theme ownership and trusted frame/origin/document checks remain. Shared semantic shade mapping preserves C1 defaults while retaining project overrides; default source palettes no longer restore legacy native/iframe colors.
- Replica-only mounts inherit owning panel without another provider resetting density. Appearance reads wait until queued host render and reject retired documents/revisions. Host boundary measurement supplies a dimension variable rather than overriding shared menu cap.

### Behavioral and build evidence

Evidence files live in [controls-c1-validation](controls-c1-validation/). Counts below distinguish broad runs from focused repairs.

- Controls: **44 tests / 14 files pass** (`controls-final.log`). Covers attribute/listener forwarding, native forms, labels, handles, search/password, disabled/readonly behavior, number edits/dragging, select keyboard/value identity/dynamic availability, numeric segments, Boolean/string checkbox compatibility, radio/list behavior, real invalid JSON drafts, provider context and finite appearance projection.
- Native Vue: latest broad run **309 pass / 1 sandbox spawn failure**, then affected SSR import test **passes outside sandbox** (`native-theme-accepted.log`, `native-import-final.log`), covering all **310 cases / 72 files**. Preset/menu ownership checks separately **7 / 3 pass** (`native-presets-final.log`); latest appearance/view lifecycle checks **7 / 3 pass** (`appearance-accepted.log`). Tests preserve SDK acknowledgements, stale-owner guards and matrix exact values/local isolation.
- Protocol: **46 pass / 1 sandbox spawn failure**, then built import test passes outside sandbox, covering all **47 cases / 14 files** (`protocol-theme-accepted.log`, `protocol-import-final.log`). SDK **133 / 27 pass** (`histoire-sdk-accepted.log`). React **39 / 7 pass** (`react-final.log`), including real wrapped Switch export/model/disabled behavior. Existing Svelte static Cypress **12 / 12 pass** (`cypress-svelte-final.log`).
- Core broad run: **1,318 pass / 1 optimizer-cache timeout**, 265 files (`histoire-accepted.log`). Same seven cache cases pass with `--testTimeout 45000` in focused rerun (`core-cache-45s.log`). This does not make original broad run green. Shared workbench palette tests **3 / 1 pass** (`workbench-theme-final.log`).
- App, workbench and embed `vue-tsc --noEmit` all pass (`type-*-closure.log`); final deferred projection embed check also passes (`type-embed-projection.log`).
- Dependency-ordered controls vendor/peer, native Vue, Vue/React/Svelte plugins, app and core builds pass. Final shared appearance build is `build-appearance.log`; final app projection rebuild is `build-closure-final.log`. Vue static book builds 42 stories/1,091 variants (`static-final.log`); React book 4/20 and Svelte 4 book 8/29 build (`framework-books.log`).
- Scoped ESLint passes (`lint-closure.log`). Reviewed source manifest is `source-files.txt`; changed Vue/TS/JS sources remain at most 300 lines. Source inventory finds no raw input/textarea/select/button templates or `h()` primitives in app-owned/native control surfaces (`source-inventory.log`). Shared primitives and third-party internals retain native controls; links and resize separators retain native semantics.

Commands used (Node 24.16.0 first in PATH because local mise shim cannot write its runtime state):

```sh
# Within affected package directories.
node_modules/.bin/vitest run
node_modules/.bin/vitest run src/__tests__/provider-theme.spec.ts src/__tests__/controls-menu-bounds.spec.ts
# Within core package.
node_modules/.bin/vitest run src/node/__tests__/workbench-theme.spec.ts
node_modules/.bin/vitest run src/node/__tests__/vitest-browser-config.spec.ts --testTimeout 45000
# From app package, for all three projects.
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.workbench.json
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.embed.json
# Package build scripts expanded nested pnpm run through /tmp/histoire-c1-run.py.
python3 /tmp/histoire-c1-run.py packages/histoire-controls build
python3 /tmp/histoire-c1-run.py packages/histoire-vue build
python3 /tmp/histoire-c1-run.py packages/histoire-plugin-vue build
python3 /tmp/histoire-c1-run.py packages/histoire-plugin-react build
python3 /tmp/histoire-c1-run.py packages/histoire-plugin-svelte build
python3 /tmp/histoire-c1-run.py packages/histoire-app build
python3 /tmp/histoire-c1-run.py packages/histoire build
```

### Browser evidence

- Static Vue controls **5/5**, overlays **4/4**, workbench **13/13**, regression **6/6** pass: **28 distinct cases** across four specs (`cypress-static-final.log`, `cypress-static-regressions.log`). First static regression run used a visibility-oriented helper after intentionally panning canonical frame offscreen; corrected final assertion retains correlated document/body and geometry/URL checks. Actual form fields and Boolean roles replace obsolete wrapper-target selectors.
- Initial C1 capture round **5/5** passes and records **29 screenshots**: Light/Dark × Comfortable/Compact × Settings, ACP Settings, native controls, matrix, iframe menu, toolbar and comments, plus narrow inspector. Full boards/component details compared in one batch. Corrections addressed native field caret behavior, full matrix axis labels, Boolean layout, shared popover shells and comment action contrast. Final functional review then exposed iframe legacy palette/density resets, host menu cap override and stale live theme projection; those defects were repaired with source tests and real browser checks.
- Live projection browser test passes in both theme directions, preserving same controls document, edited draft and canonical state. See `controls-appearance.cy.js`; native field background must equal iframe field background. C1 checks additionally require projected density, disabled options, End focus on Option49, 360px menu cap, matrix frame content and Escape focus restoration.
- Browser state proof and latest campaign results are recorded below. Initial 29 captures are retained until replaced by matching final state captures; earlier screenshots alone do not prove later functional repairs.

Cypress commands:

```sh
# From examples/vue3; explicit baseUrl for owned local test servers.
node_modules/.bin/cypress run --config baseUrl=http://localhost:4568 --spec cypress/e2e/controls.cy.js,cypress/e2e/controls-overlays.cy.js,cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js
node_modules/.bin/cypress run --config baseUrl=http://localhost:6011,retries=0 --spec cypress/e2e/controls-appearance.cy.js,cypress/e2e/controls-c1.cy.js,cypress/e2e/ui-workbench.cy.js --env workbenchMode=dev
# Optional state filters reuse same C1 test instead of duplicating fixtures.
node_modules/.bin/cypress run --config baseUrl=http://localhost:6011,retries=0 --spec cypress/e2e/controls-c1.cy.js --env workbenchMode=dev,controlsAppearance=Light,controlsDensity=Compact
```

### Detector and limits

Impeccable detector ran **once** after implementation over controls/app/native controls. `impeccable-findings.json` contains **120 token-scale advisories** (54 radii, 62 font sizes, 4 colors) and **one existing side-tab warning** in StoryResponsivePreview. Pinned C1 dimensions take precedence over older DESIGN.md scales. Detector exit2 is recorded, not described as a clean detector run.

Full-catalog dev campaigns suffered repeated collection, preview readiness failures and Node heap exhaustion at 4GB and 8GB. Temporary acceptance config freezes package watching and retains default ignored paths; excluding generated `.story.js` paths did not exclude their `.story.md` sources and virtual outputs. This was not evidence that ignored physical-story paths bypassed the watcher. Project configuration stays untouched. Long campaigns also encountered blank passive matrix documents. Original dev screenshot-service checks timed out without a correlated reply, despite valid outgoing capture payloads; no successful fresh PNG/WebP capture claim is made without later passing evidence. Temporary-config Settings preview errors are validation-environment limits; project save confirmation/acknowledgement is covered by behavioral suites, not a new browser filesystem save.

Builds/tests were sequenced around emitted packages. Concurrent unrelated dirty/staged/untracked work preserved. No staging, commit or push. No CI/deploy or live agent-provider integration claim.

### Final C1 closure

All five C1 acceptance cases pass on final build with fresh server per state: Light/Comfortable, Light/Compact, Dark/Comfortable, Dark/Compact and narrow provider. State filters run unchanged acceptance bodies; four cases verify real rendered matrix cells as well as settings, native fields, sandbox fields/menus, toolbar and comments. Final **29 captures** replace initial images in [screenshots](controls-c1-validation/screenshots/). Logs: `cypress-light-comfortable.log`, `cypress-light-compact.log`, `cypress-dark-comfortable.log`, `cypress-dark-compact.log`, `cypress-narrow.log`; campaign summary `state-proof.log`.

Final focused live-theme check also passes, keeping original iframe document and draft while colors change in both directions. Its passing result appears in interrupted longer `cypress-dev-closure.log`; that longer campaign did not pass and is not a full-suite acceptance claim. Final screenshot inspection confirmed consistent native/sandbox fields, bounded long-option menus with visible End focus, readable metadata and violet comment actions. No further cosmetic pass performed.

Representative final captures: [native light](controls-c1-validation/screenshots/c1-light-comfortable-native.png), [native dark compact](controls-c1-validation/screenshots/c1-dark-compact-native.png), [dark iframe menu](controls-c1-validation/screenshots/c1-dark-compact-iframe-menu.png), [narrow menu](controls-c1-validation/screenshots/c1-narrow-iframe-menu.png), [comments](controls-c1-validation/screenshots/c1-dark-comfortable-comments.png).

Fresh development workbench retry passed actual PNG and WebP captures through screenshot service, including image decoding and served MIME types; comment draft persistence/resolve/reopen also passed (`cypress-dev-workbench.log`). That full run finished **6/15 pass**: eight cases timed out at owning preview readiness after four seconds, and one matrix case retained disabled readiness-dependent action. These are observed failures, not attributed to baseline or controls without evidence. Earlier no-reply screenshot-service failures therefore remain historical campaign failures; final fresh PNG/WebP capture has positive evidence. Matrix capture remains unverified.

Final source review retained 201-file manifest, no changed Vue/TS/JS source above 300 lines and 29 final C1 images. Test-owned static Vue/Svelte servers and browser proof tab closed; user preview and tabs preserved.

Final dev retry used `defaultCommandTimeout=20000` without changing tests or source. Cypress reports **7/15 pass, 8 fail** (`cypress-dev-workbench20.log`): detached document during startup reload, three owning-readiness failures, blank passive matrix documents, disabled matrix action and two page-load timeouts. Reload recovery, theme, pan/zoom, viewport persistence, mode constraints, comments and actual PNG/WebP capture pass. Runner exceeded its 600-second supervisor budget and cleanup needed SIGTERM after SIGINT; timeout receipts remain in `dev-workbench20-proof.log`. This is a failed campaign, not full dev acceptance. Scoped `git diff --check` passes (`diff-check.log`). No further retries or cosmetic edits.

### 2026-10-04 acceptance repair

Current acceptance is green. Historical failed campaigns above remain recorded; the following complete runs supersede their readiness, capture, matrix and optimizer-timeout limits.

#### Repairs and ownership

- Browser mount/reconnect events no longer request full catalog recollection. Filesystem changes and explicit collection retain ownership. A regression failed before this change and proves repeated mounts stay read-only while real story HMR still requests collection.
- Story watcher rechecks match/ignored patterns on add events without stats, and ignores unlink of unregistered or virtual paths. Real physical-story removal still publishes once. Regression failed before the guard. Generated Markdown stories keep their established owner.
- Collection windows close their jsdom timers/documents before globals are restored. Teardown is idempotent, so repeated retirement cannot remove a later environment. Timer regression failed before this repair; native BroadcastChannel remains usable.
- Toolbar and comment captures pause only their provider's automatic test discovery before sending capture. Concurrent owners share an idempotent pause; discovery resumes after final release, preserving pending changes and rejecting late results. Shared execution lane still waits for confirmed runner cleanup. Existing preset acknowledgements and stale-owner protection remain covered by full native suite.
- Abort now calls Vitest's `cancelCurrentRun('keyboard-input')` before browser cleanup. Its browser pool treats an unannounced RPC-page close as a fatal run; one diagnostic campaign therefore exited without cleanup acknowledgement and correctly quarantined the lane. Cancellation-order regression failed first. Pool notification fixes that failure while retaining quarantine for genuinely unconfirmed cleanup.
- Browser assertions use the existing 20-second preview-admission budget for canonical readiness and replaced passive matrix documents. Exact body values, document identity, keyboard behavior, and capture receipts remain asserted. Generic command timeout stays unchanged; Cypress retries are disabled. The last failing matrix check observed an empty replacement body after four seconds, rather than an incorrect finite value.

#### Complete proof

- Development Cypress: **37/37 pass across six specs**, one complete campaign, `retries=0` (`acceptance-cypress-green.log`). Controls **5**, overlays **4**, workbench **15**, regressions **7**, live appearance **1**, C1 states **5**. Includes actual PNG/WebP decoding and served MIME types, distinct PNG pixels for cells sharing one base variant, exact finite scalar edits, matrix-local overrides, comment draft persistence, focus restoration, and retained live controls document/draft across theme changes.
- Core: **1,330/1,330 tests, 267 files pass** (`acceptance-core-suite.log`). Four workers bound CPU contention; original 15-second test deadline remains unchanged. Previously failing `vitest-browser-config.spec.ts` runs inside this complete green suite; no 45-second timeout override used.
- Native Vue: **311/311 tests, 72 files pass** in one complete run outside restricted sandbox (`acceptance-native-suite.log`). Covers actual built import, SDK acknowledgements, preset apply/reset/rename, stale ownership, matrix exclusions/base edits and discovery/capture ownership.
- Focused repair baselines: collection **22/3**, watcher/Markdown **8/2**, discovery/model **23/2**, Vitest cancellation/cleanup/capture **25/5** pass. Red receipts remain in `acceptance-*-red.log`; these counts overlap full suites and are not added to them.
- Final app and core builds pass (`acceptance-build-app-final.log`, `acceptance-build-core-final.log`). App, workbench and embed typechecks pass (`acceptance-type-*.log`). Shared controls vendor/peer and framework build evidence remains in preceding implementation section.
- Scoped ESLint and whitespace review pass (`acceptance-lint-final.log`, `acceptance-lint-browser.log`, `acceptance-source-review.log`). All **16 acceptance sources** remain at most 300 lines; manifest is `acceptance-source-files.txt`. Capture coordination reuses one small composable; temporary diagnostic spec removed. Prior controls/chrome inventory remains valid because these repairs add no native field/button skins.

Normal Vue project configuration was used. One startup catalog collection served both full campaigns without browser-driven recollection, heap exhaustion or fatal Vitest rejection (`acceptance-dev-server.log`). Earlier 36/37 run is retained as `acceptance-cypress-before-readiness-fix.log`; interrupted earlier teardown investigation is `acceptance-cypress-before-cancel-fix.log`. A traced 24/24 intermediate run is preserved separately and is not substituted for final uninstrumented proof.

Final campaign produced **29 C1 screenshots** in [acceptance-screenshots](controls-c1-validation/acceptance-screenshots/): light/dark × comfortable/compact across Settings, ACP, native controls, matrix, iframe menu, toolbar and comments, plus narrow provider. Batched confirmation retains prior board/component comparison: shared native/sandbox appearance, bounded long-option menus with visible End focus, readable flow metadata and violet agent actions. No new cosmetic changes were needed. Prior single Impeccable detector result remains recorded; pinned C1 dimensions still explain its token-scale advisories.

Commands (Node 24.16.0 first in PATH, dependency builds/tests sequenced):

```sh
# Core package; original configured testTimeout=15000.
node_modules/.bin/vitest run --maxWorkers 4
# Native Vue package.
node_modules/.bin/vitest run --maxWorkers 4
# App package.
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.workbench.json
../histoire-controls/node_modules/.bin/vue-tsc --noEmit -p tsconfig.embed.json
# Root; nested package scripts expanded by existing temporary build runner.
python3 /tmp/histoire-c1-run.py packages/histoire-app build
python3 /tmp/histoire-c1-run.py packages/histoire build
# examples/vue3; owned dev server, normal histoire.config.ts.
NODE_OPTIONS=--max-old-space-size=4096 node_modules/.bin/histoire dev --port 6011
node_modules/.bin/cypress run --config baseUrl=http://localhost:6011,retries=0 --spec cypress/e2e/controls.cy.js,cypress/e2e/controls-overlays.cy.js,cypress/e2e/ui-workbench.cy.js,cypress/e2e/ui-review-regressions.cy.js,cypress/e2e/controls-appearance.cy.js,cypress/e2e/controls-c1.cy.js --env workbenchMode=dev
```

Acceptance-owned servers/runners closed with successful cleanup; user's preview preserved. Validation is local. Detector advisories and live provider-integration boundaries remain as described above. No staging, commit or push; concurrent changes preserved.
