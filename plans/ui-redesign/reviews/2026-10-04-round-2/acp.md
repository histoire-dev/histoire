# Fresh ACP/comments review — slices 16–17

2026-10-04. Read-only workspace audit. Four confirmed findings: one P1, three P2. No repository source/document edits, build, typecheck, browser, Cypress, Git action, real ACP adapter, installer, permission change, or real credentials.

## [P1] Public ACP sanitizer loses credentials across agents and runtime rotation

Primary source: `/home/akryum/Projects/histoire/packages/histoire/src/node/acp/manager.ts:40`; rotation sequencing: same file lines 219–221; owned shutdown log publication: lines 103–112.

Two separate reproductions share public-redaction ownership:

1. **Duplicate environment key across agents.** Save `AGENT_TOKEN=FIRST-FAKE-CREDENTIAL` for agent `first`, then `AGENT_TOKEN=SECOND-FAKE-CREDENTIAL` for agent `second`. Prompt first through existing fake ACP peer. Its stderr `fixture log FIRST-FAKE-CREDENTIAL` appears unredacted in public snapshot events. Final streamed reply remains redacted. `Object.assign({}, ...Object.values(data.env))` overwrites first value because environment variable names collide; agent-local reply filter cannot repair stderr/permission/error projection. Proof: `acp/colliding-secrets.spec.ts`, actual fake subprocess outside sandbox, 1 test passed.
2. **Overwritten credential during owned process shutdown.** Start controlled peer with `OLD-FAKE-CREDENTIAL`, then rotate same variable to `NEW-FAKE-CREDENTIAL`. Peer writes old fake value to stderr upon SIGTERM. `setEnvironment` replaces `data` before stopping predecessor, and predecessor retains log publication authority until stop resolves. Public snapshot contains `shutdown OLD-FAKE-CREDENTIAL`. Proof: `acp/rotation-live.spec.ts` plus `acp/rotation-agent.mjs`, actual subprocess outside sandbox, 1 test passed. Independent mocked-runtime proof: `acp/rotation.spec.ts`, 1 test passed.

Impact: user-level credentials cross write-only boundary into public HMR snapshots/logs. Common configurations use identical variable names for multiple agents, and credential rotation is normal operation.

Fix boundary: collect all values across agent environments without overwriting by variable name; preserve captured runtime secrets until its output/error/permission publication is retired. Ensure current public projection also recognizes secrets for retiring records. Avoid globally invalidating unrelated agents.

Useful regression: two enabled agent presets using same environment key with different fake secrets; assert replies, stderr, errors, permission details, and every snapshot omit both values. Separate test rotates live synthetic credential while controlled adapter logs it on SIGTERM; assert no retired value reaches any public event.

## [P2] Reply admission does not reserve whole-file capacity

Primary source: `/home/akryum/Projects/histoire/packages/histoire/src/node/comments/store.ts:118–127`; storage ceiling: `/home/akryum/Projects/histoire/packages/histoire/src/node/comments/file.ts:49–50`; failed-success recovery: store lines 140–150.

Trigger: valid comments file near existing 2 MiB bound, while target comment remains far below its 48 KiB/64-message bounds. Per-comment reservation passes, agent runs and completes, then reply exceeds whole-file bound and cannot be stored.

Proof: `acp/comments.spec.ts`, first test. 243 valid comments produce 2,096,128 bytes (1,024 bytes below ceiling). Runner executes once, returns 6,800-character successful outcome. Send rejects with exact message `Agent completed, but its comment reply could not be stored. Existing history is preserved.` Persisted target becomes `replied` with empty thread. Original history survives; completed new outcome is lost. No external file edit or disk failure involved. Test passed.

Impact: ordinary growth of local history admits work whose completion cannot persist. UI cannot recover lost outcome; replay may repeat file edits. Historical finding 3 repaired per-thread limits; this reproduction exercises separate aggregate-file ceiling.

Fix boundary: reserve encoded whole-file reply capacity before dispatch inside physical-file mutation/admission lane. Account for simultaneous pending replies and unrelated comment writes, including root aliases; preserve bounded completed outcome if exceptional persistence still fails.

Useful regression: near-limit valid multi-comment file rejects before runner call; second test checks concurrent clients cannot consume pending reply's reserved file bytes. Assert history retained and no stuck lifecycle.

## [P2] Unrelated comment publication acknowledges pending composer request

Primary source: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/stores/comments.ts:67–72`.

Trigger: composer submits save/send; another client's comment save or agent lifecycle change broadcasts complete snapshot before this request persists. Every snapshot clears `pendingDraft` and `pending`, even when it lacks submitted ID. Existing ID is also treated as success without matching submitted body/context.

Proof: `acp/comments.spec.ts`, second test. Submit new draft, observe `pending=true`, publish unrelated comment snapshot, observe `pending=false`; identical `sendDraft` is accepted again and transport contains two sends. Test passed.

Impact: pending UI re-enables before its own acknowledgment; duplicate send accepted, and editing an existing draft can dismiss unsaved text on stale same-ID snapshot. Server per-comment admission prevents overlapping execution, but does not supply request-correlated save completion or prevent a later duplicate after earlier work completes.

Fix boundary: request-correlated success/failure acknowledgment, or preserve pending composer until publication matches submitted writable values; unrelated broadcasts remain state updates. Targeted failure must retire only matching request.

Useful regression: two clients with interleaved save/working publications. Pending composer remains pending through unrelated snapshots and old same-ID values, then clears only on matching save or correlated failure. Keep submitted text on failure; reject second send while pending.

## [P2] Switching comment threads reuses previous reply input

Primary source: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/comments/CommentThread.vue:29–40`. Callers render unkeyed component bound to currently selected ID: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/comments/CommentsCanvasOverlay.vue:105` and `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/comments/CommentsPanel.vue:73`.

Trigger: type unsent reply in thread A, then select thread B without closing shared floating thread. Vue reuses component; `reply` ref neither resets nor keys by comment ID. Submit now emits A's text to caller, which sends against current thread B and B's agent/context.

Proof: `acp/thread.spec.ts` mounts actual production SFC, types A's instruction, changes comment props to B, verifies input retained, submits, and observes old instruction emitted while current comment ID is B. 1 test passed using production Vue compiler and jsdom; no browser/pixel claim.

Impact: instruction intended for different annotation/agent can be sent with wrong story/variant context.

Fix boundary: scope unsent reply by comment ID, or clear it on ID change / key each thread component. Keep same-thread streaming updates from resetting user input.

Useful regression: actual mounted shared thread moves A to B; A's unsent draft cannot submit as B. Same-thread updates preserve draft. Include orphan-thread pane path.

## Verification and limits

Current plan README, slices 16/17, contracts, architecture, validation, user ACP/comments guides and two supplied agent/comments PNG boards inspected. Historical implementation-review closures used only to distinguish repaired per-thread capacity/admission/permission defects from new cases.

Existing focused coverage: **14 unique suites / 76 unique tests pass in completed appropriate execution**. Initial sandbox run (10 suites / 55 tests) passed 40 and failed 15 process tests because Node child executables exit 0 without running. Plain Node spawn reproduced same behavior, while /bin/echo worked. Process-bearing exact rerun outside sandbox passes **3 suites / 19 tests**; no source defect inferred from sandbox failures. Additional UI-agent/element/identity tests pass **4 suites / 21 tests**. Existing pure seven suites contributed 36 passing tests. Independent behavioral probes: **5 files / 6 tests pass**; synthetic credentials only. Separate runtime diagnostic intentionally reproduced sandbox failure and is excluded from behavioral count.

Commands from `/home/akryum/Projects/histoire/packages/histoire` with PATH prefix `/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.local/share/pnpm/.tools/pnpm/10.33.0/bin:$PATH`:

```sh
pnpm exec vitest run src/node/__tests__/acp-manager.spec.ts src/node/__tests__/acp-admission.spec.ts src/node/__tests__/acp-process-tree.spec.ts src/node/__tests__/acp-permission-ownership.spec.ts src/node/__tests__/acp-overrides.spec.ts src/node/__tests__/acp-user-data.spec.ts src/node/__tests__/comments-store.spec.ts src/node/__tests__/comments-capacity.spec.ts src/node/__tests__/comments-channel.spec.ts src/node/__tests__/comments-client.spec.ts --maxWorkers=2
# Process-bearing rerun outside sandbox:
pnpm exec vitest run src/node/__tests__/acp-manager.spec.ts src/node/__tests__/acp-admission.spec.ts src/node/__tests__/acp-process-tree.spec.ts --maxWorkers=2
pnpm exec vitest run src/node/__tests__/ui-agents.spec.ts src/node/__tests__/preview-element-inspection.spec.ts src/node/__tests__/preview-ui-message-guard.spec.ts src/node/__tests__/canvas-registry.spec.ts --maxWorkers=2
# Pure independent probes:
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/acp/vitest.config.mts /tmp/histoire-ui-review-round-2/acp/comments.spec.ts /tmp/histoire-ui-review-round-2/acp/rotation.spec.ts --maxWorkers=2 --reporter=verbose
# Controlled process probes outside sandbox, each passed:
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/acp/vitest.config.mts /tmp/histoire-ui-review-round-2/acp/rotation-live.spec.ts --maxWorkers=2 --reporter=verbose
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/acp/vitest.config.mts /tmp/histoire-ui-review-round-2/acp/colliding-secrets.spec.ts --maxWorkers=2 --reporter=verbose
# Actual production SFC behavior:
pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/acp/vue.config.mts --maxWorkers=2 --reporter=verbose
```

No real-agent authentication or interactive tool acceptance; Windows process cleanup not tested. These remain validation limits, not new findings. Matrix comments use target-key overlay lookup despite exact cell frame key at picking; no independent mounted/full-browser reproduction completed, so anchor suspicion is **unverified and excluded from findings**. Root owns integration/browser validation.

All acquired managers/process groups closed in finally; probe-created project roots removed. Retained only review scripts/configs/report under owned `/tmp/histoire-ui-review-round-2/acp`. Post-run anchored process inventory found no owned ACP fixture process.
