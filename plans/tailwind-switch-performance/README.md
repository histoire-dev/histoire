# Tailwind variant switching performance

## Objective and evidence

Keep existing retained Single iframe/session behavior while removing work identified in `Trace-20261007T142723.json`: three hidden test-discovery tasks of 904/1101/973 ms, full token-tree mount/unmount, and per-copy-button clipboard/tooltip overhead. Trace confirms zero canvas document navigations. Earlier small-story timing results are not acceptance evidence for Tailwind.

## Execution and ownership

All implementation agents use `gpt-6-luna`, reasoning `max`. Shared checkout contains concurrent work: preserve all existing edits, no staging/commit/push, and own only assigned files. Read before editing. Functions and new API properties need JSDoc; source files should stay near 300 lines. Reuse existing fixtures, runtime services, and virtualization rather than adding parallel infrastructure.

1. **Slice 0: baseline and browser proof.** Dedicated agent owns benchmark scripts, new focused browser regression, and validation report. Capture baseline before production edits or package rebuilds. Keep sources unchanged until baseline agent releases gate.
2. **Slice 1: known-empty generated test collection.** Runtime agent owns test-session/generated-story seam and focused backend tests. Implement after baseline gate, independent of slices 2/3. See `01-test-discovery.md`.
3. **Slice 2: bounded token rendering.** Token agent owns design-token components/helpers, Tailwind runtime integration, and token tests. Implement after baseline gate; coordinate generated story changes with slice 1. See `02-token-rendering.md`.
4. **Slice 3: lazy clipboard lifecycle.** Clipboard agent owns HstCopyIcon and narrowly scoped helper/tests. Implement after baseline gate, independent of slices 1/2. See `03-copy-lifecycle.md`.
5. **Slice 4: integration and performance acceptance.** Parent reviews all diffs and contracts, runs focused tests/typechecks/lint/builds. Baseline agent repeats identical dev/static benchmark and browser regression only after package builds settle. See `04-validation.md`.

Agents may research, write regression tests, and refine their slice documents while baseline runs, but must not change production files/build outputs before gate release. Report deviations and evidence in these documents. Do not introduce public configuration, protocol fields, broad runtime caches, hidden iframe pools, or dependencies unless existing architecture makes a narrowly documented exception necessary.

## Acceptance

- Same-story switching retains exactly one canvas iframe and contentDocument.
- Generated Tailwind test collection returns accurate empty definitions without hidden component mounts. Ordinary module/setup/render registrations still collect correctly; no `hasTests === false` shortcut for arbitrary stories.
- Large token sets mount bounded visible content with overscan; all tokens remain reachable by scrolling/search, responsive columns and variable sample sizes work, copy and controls remain usable.
- Clipboard setup does no per-token permission work before user action, keeps per-button feedback, and releases resources on unmount.
- Dev/static median improves; investigate any repeatable p95 regression. Report measured results without CI millisecond thresholds or unmeasured claims.
