# Slice 4: integrated proof

## Before changes

Benchmark agent captures current dirty checkout as baseline, preserving prior Single frame reuse work. Use same browser, generated Tailwind fixture and viewport in dev and static. Alternate large categories background-color/border-color/text-color for 5 warmups then 30 measured switches. Existing attached trace is diagnosis evidence, not directly comparable benchmark baseline.

## Measurements

Measure initiation to destination host readiness including state restoration; separately capture post-ready main-thread blocking caused by auto collection so readiness alone cannot hide work. Keep raw samples, median/p95, live canvas frame count, contentDocument identity, and navigation count. If browser/fixture unavailable, report exact blocker and do not substitute small-story numbers. No hard timing assertions in CI.

## Browser behaviors

Focused regression verifies same iframe/document, bounded rendered large category, native scrolling to last token, filter and clear, responsive resize/reflow, copy action, typography controls, A/B/A state restoration. Dev/static both. Ordinary and Vitest-mocked existing switching tests stay passing. Verify generated collection no longer creates hidden large token tree, ordinary tests still discover.

In Single view, background scope is global because the toolbar has no selected-frame owner; browser coverage verifies that shared background remains applied across switches. Per-frame background overrides remain covered by the existing canvas switching component tests. This task does not change background-scope behavior.

## Integration checks

Parent reviews production diffs and tests for lifecycle races, DOM/measurement feedback loops, accessibility/focus, source invalidation, cleanup, dependency direction, and duplication. Run affected controls, Vue lifecycle/ownership, backend collection/readiness/Tailwind suites, relevant TypeScript checks, changed-file lint, app/package builds, and static example build. Track preexisting CanvasViewport responsiveDisabled typecheck failure separately if still present. Preserve all concurrent work; never broad reset or stage.

## Baseline before implementation

Captured 2026-10-07 with Playwright Chromium, 1400×900 viewport, real story-tree clicks on generated Tailwind categories cycling background-color, border-color, and text-color. Each run used five warmups then 30 timed selections. Host readiness required the destination frame key, host and replica `aria-busy=false`, and removal of inert state. Post-ready metric sums long-task overlap from destination admission until the next click handler starts; the final switch uses a 1200 ms settle window. This records blocking but does not attribute each task to a specific subsystem. The uploaded trace provides separate stack attribution.

| Environment | Median host ready | p95 host ready | Median post-ready long tasks | p95 post-ready long tasks |
| --- | ---: | ---: | ---: | ---: |
| Dev | 1,504.9 ms | 2,899.1 ms | 1,434.7 ms | 3,293.2 ms |
| Static | 618.7 ms | 1,052.1 ms | 625.1 ms | 1,102.9 ms |

Both runs retained one canvas frame and one replica, kept the same `contentDocument` and `documentId` through all switches, and made zero additional canvas sandbox document requests. Total iframe count was two because workbench also hosts a separate custom-controls iframe. Dev generated 36 controls iframe document requests across 35 switches; those were excluded from canvas navigation count. Static baseline came from the frozen 14:13 build at `/tmp/histoire-tailwind-static-before`; SHA-256 of `index.html` is `babb991da572d212f5c1261929aade7ea054944432383eacd22f52940ea7bcad`. Durable raw captures are `results/before-dev.json` and `results/before-static.json`.

The dev process logged dependency optimization and package bundle reload notices during its run, so treat dev timings as a single noisy baseline. The static run used a copied, frozen build. The reproducible runner is `benchmark.cjs`; start the example server in dev or static mode, then run `node plans/tailwind-switch-performance/benchmark.cjs <base-url> <output-json>`. Repeat measurements after implementation under the same fixture and browser conditions. No millisecond CI threshold.

## Results after implementation

The final run used the same generated Tailwind fixture, Chromium, 1400×900 viewport, story-tree sequence, five warmups, and 30 timed switches. Host readiness still waited for the destination frame key, host and replica readiness, and inert removal; state restoration stayed inside the measurement.

| Environment | Before median / p95 host ready | After median / p95 host ready | Before median / p95 post-ready long tasks | After median / p95 post-ready long tasks |
| --- | ---: | ---: | ---: | ---: |
| Dev | 1,504.9 / 2,899.1 ms | 101.1 / 126.6 ms | 1,434.7 / 3,293.2 ms | 0 / 11.9 ms |
| Static | 618.7 / 1,052.1 ms | 93.9 / 130.0 ms | 625.1 / 1,102.9 ms | 0 / 6.4 ms |

Static comparison is strongest: median readiness fell 84.8%, p95 fell 87.6%. The dev baseline was noisy from Vite dependency optimization and package reloads, so treat its reduction as directional. The post-ready metric sums long-task overlap from destination admission until the next click handler starts; the last selection uses a 1,200 ms settle interval.

Final dev and static results each show one initial canvas sandbox document request, zero requests during switches, zero replaced frames, one live canvas frame, and one replica. Total iframe count remained two because the workbench also hosts a controls iframe. Both separate hidden-mount probes recorded zero added roots, zero peak mounted roots, and zero Tailwind samples in hidden roots; the visible canvas began with 15 samples. The earlier static structural probe recorded 35 hidden-root additions and a peak of 238 total Tailwind samples against 237 initially visible.

The focused Cypress suite passed 5/5 tests in dev and 5/5 in static: three Tailwind virtualization/switching tests plus the existing ordinary and Vitest-mocked Single switching tests. Separate native Tab probes reached `red-950` beyond the initial mounted window ending at `red-900` in both builds. Single-view background coverage verifies shared background persistence; selected-frame background overrides remain covered by existing component tests. Final static build contained 42 stories and 1,095 variants; SHA-256 of `examples/vue3/.histoire/dist/index.html` is `37c8a8137440e9c0dca4d107e05219e55bbdc03fbf88895e890e78fe081cae1a`.

Reproduce timings with `node plans/tailwind-switch-performance/benchmark.cjs <base-url> <output-json>`. Add `--observe-hidden-mounts` for a separate structural run; do not compare timings from that instrumented run. Run `node plans/tailwind-switch-performance/focus-tab.cjs <base-url>` for native Tab coverage. Final raw timing captures are in `results/after-dev.json` and `results/after-static.json`; compact structural comparison is in `results/structure.json`.

## Final integration validation

- Focused tests passed: 87 backend collection/generated-runtime tests, 45 runtime/action/comment/measurement tests, 78 controls tests, and 24 Vue lifecycle/ownership tests.
- Controls and Vue package builds, backend TypeScript emission, app build (including embed), and static example build passed. Controls, Vue package, and backend typechecks passed. Changed-file lint and `git diff --check` passed.
- Workbench typecheck still reports the pre-existing error in unchanged `CanvasViewport.vue:116`: `Property 'responsiveDisabled' does not exist`. This task does not fix that unrelated catalog type mismatch.
- A backend clean-build attempt collided with a concurrent `dist` writer (`ENOTEMPTY`). TypeScript emission subsequently passed without deleting concurrent build output.
- Independent final review found no remaining concrete correctness issue. Task-owned browser servers were stopped. Nothing was staged, committed, or pushed.

Token virtualization is opt-in for generated Tailwind content. Browser find and printing see only mounted rows; token search and native scrolling retain access to all tokens. Existing general-purpose token consumers keep full rendering by default.
