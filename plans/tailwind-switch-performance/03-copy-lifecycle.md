# Slice 3: remove eager per-copy-button setup

## Contract

Hundreds of `HstCopyIcon` instances currently call `useClipboard()` during setup; trace samples show permission queries and listener setup/cleanup. Mounting inactive copy actions must avoid clipboard permission queries and success-tooltip listeners. Preserve asynchronous content producers, accessible action labels, focus `expose()`, per-button Copied feedback/reset, error behavior, and clipboard fallback behavior supported today.

## Research evidence

The installed controls dependency is `@vueuse/core` 12.8.2. Its `useClipboard()` calls `usePermission('clipboard-read')` and `usePermission('clipboard-write')` at setup; each starts a permission query and change listener. Defaults are `read: false`, `legacy: false`, and a 1500 ms copied reset. With no `navigator.clipboard` property, `copy()` is a silent no-op. A rejected supported `writeText()` falls back to a temporary textarea and `execCommand('copy')`.

The trace ties this eager setup to the Tailwind token tree: one copy control per rendered token, plus `usePermission`, `query`, and listener cleanup samples. The concrete fix can stay local to `HstCopyIcon`; no shared copied-state service is needed.

## Implementation

Own `components/HstCopyIcon.vue`, a narrow adjacent helper if needed, and focused controls tests. Preserve concurrent changes. Write directly through `navigator.clipboard.writeText()` only after resolving content from a live component. If the Clipboard API property is absent, retain the current silent no-op. If a supported write rejects, preserve its legacy copy fallback. Keep copied state, reset timer, focus handle, and cleanup local to each icon. Guard pre-write and post-write continuations with component lifetime so deferred content cannot start clipboard work after unmount and in-flight results cannot trigger fallback or feedback after unmount. Render the success tooltip only while copied when this can be done without shifting focus or changing button semantics. Avoid broad overlay/button refactors and dependency upgrades.

## Tests first

New focused suite: `packages/histoire-controls/src/components/HstCopyIcon.spec.ts`. It covers 32 inactive icons, no permission/tooltip-listener setup before click, asynchronous content, per-button success/reset, producer errors, absent-API no-op, write rejection fallback, focus, and unmount during deferred content/write. Tests were added before production edits; execution waits for baseline capture to finish.

After the baseline gate, run this suite plus existing controls overlay and button/copy compatibility suites. Record failures and focused results here.

## Completion

`HstCopyIcon` now uses direct native `writeText()` after content resolution, with no clipboard composable or permission query at setup. Missing Clipboard API remains a silent no-op. Rejected writes retain the temporary textarea/`execCommand('copy')` fallback, now removed in `finally`. Copied state and its 1500 ms timer remain per icon; unmount guards prevent deferred content, rejected writes, or successful writes from starting new work or publishing feedback after retirement. The copied tooltip branch mounts only while feedback is active. Existing `icon-only` button change was preserved.

Validation passed: focused lifecycle suite (10 tests), then combined copy, overlay, button, button-group, and compatibility suites (5 files, 21 tests). `git diff --check` passed. Initial listener assertion counted four unrelated global listeners; narrowing it to the rendered copy SVGs produced the intended zero-before-click assertion. No package build/typecheck run in this slice.

Owned files: `packages/histoire-controls/src/components/HstCopyIcon.vue`, `packages/histoire-controls/src/components/HstCopyIcon.spec.ts`, and this slice document. No dependency upgrades.
