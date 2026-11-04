# 10 — Watch scheduling and restart recovery

Status: **complete** (2026-11-04, see evidence). Dependencies: [02](02-progress-and-restart-reasons.md), [07](07-test-execution-service.md), [08](08-tests-console.md), [09](09-affected-story-selection.md).

## Goal

Complete affected-story watch with correct collection barriers, coalescing, cancellation, and recovery across runtime replacement.

## Source targets

- `packages/histoire/src/node/bin.ts`, dev CLI options and durable parent terminal preferences.
- New `packages/histoire/src/node/runtime/terminal/` watch coordinator; existing affected selector, test owner, collector/catalog observations.
- Tests view/shortcuts and plain command/reporter; terminal integration fixtures.

## Implementation steps

1. Register `--test-watch` and serialize desired watch preference/scope into current child command/startup inputs. Default false; flag initially selects All. Enable via Tests `w` or plain `watch` toggle.
2. Enabling captures scope, establishes evidence, waits for usable collection, then runs initial scope once. Publish enabled/waiting/running/paused state separately from operation/server lifecycle.
3. Observe existing file/collection events, not another filesystem watcher. Apply 09 to retained evidence; union affected IDs while acquisition/collection/run is active. Track current edit batch independent of catalog fingerprint.
4. Wait until collection is genuinely usable and no newer pending collection owns source. Catalog subscription alone cannot release barrier because unchanged publication may not notify. Queue callback/collection observation must not deadlock collector by awaiting test run inside awaited collection handler.
5. If active/queued terminal work is invalidated, cancel it, retain interrupted batch's remaining required targets, join confirmed cleanup, then submit one successor for union of pending targets. Existing other-owner work stays queued/running normally.
6. Claim pending set atomically for admission; restore it if admission is transiently blocked. New edits during asynchronous admission/analysis must not disappear or execute under old authority. Queue-full waits for meaningful lane/state change or explicit action, not uncontrolled busy polling.
7. Refresh evidence after successful owned collection/analysis. Unchanged background revalidation without edit does not trigger another run. Exclude generated/cache output to avoid self-triggered loops.
8. Explicit scope change cancels/drains terminal work, resets pending selection, analyzes new scope, and runs it once. Removing selected story/variant pauses with visible reason and never changes to All.
9. On config restart parent retains preference/scope; retire all child callbacks/operations. New ready generation verifies target, rebuilds evidence, and runs retained scope once. Config/collection failures pause until meaningful source recovery; no infinite retry on infrastructure failure.
10. `s`/plain `stop` disables watch before cancelling active work. Late completion cannot reschedule after stop. Browsing/switching view does not change watch target or stop it.
11. Plain `--no-tui --test-watch` requires no keyboard input and prints initial/progress/result/recovery status. Assertion failures remain completed runs and watch stays enabled.

## Useful tests

- Real CLI watches assertion-only source edit with identical story titles/variants; result changes from known fail to pass.
- Hold active browser body; edit dependencies affecting A then B. Observe cancellation/cleanup, then one coalesced successor running both and excluding C. Intermediate pending targets cannot be lost.
- Shared setup/opaque/structural changes follow 09, and ignored generated output never creates repeated runs.
- Config failure/correction retains same public URL and selected variant; new generation runs once. Deleted selected target pauses with no whole-book body markers.
- Stop during held cleanup, release late completion, assert no automatic successor; fresh explicit enable still works.
- Queue occupied by another owner, source edits while terminal waits, then release: terminal uses newest valid batch without overtaking or cancelling other owner.
- Plain flag executes initial and edit-triggered real browser runs with expected summaries.

## Acceptance criteria

No lost affected targets, overlapping terminal runners, stale publication, generated-output loops, or silently broadened selection. Collection completion and confirmed cleanup control admission through actual command path.

## Exclusions

No persistent Vitest watch process, periodic rerun timer, eager graph rebuilding when watch disabled, or automatic dependency installation/retry of uncertain admitted work.

## Handoff receipt

Record scheduler states, pending-set/cancellation decisions, gate-based coalescing proof, config/deletion/stop recovery, plain watch results and remaining limits in [evidence](evidence.md). 11 requires complete watch qualification, not only unit selector pass.
