# 04 — Log browser, errors, and session information

Status: **complete** (2026-11-04, QR added in follow-up, see evidence). Dependencies: [03](03-terminal-surface-and-modes.md).

## Goal

Inspect retained logs/errors and session details without losing place during live output or runtime replacement.

## Source targets

- `packages/histoire/src/node/terminal/` history/navigation, platform actions, session projection, logs/info views.
- `packages/histoire/src/node/runtime/terminal/` bounded session metadata projection; existing safe version/MCP metadata seams.
- Histoire package manifest/lockfile for explicit clipboard/QR/display-width dependencies, added only where used.

## Implementation steps

1. Add bounded log history with stable increasing session IDs, entry/UTF-8-byte caps, omission counters, and final partial-line handling from 01. Factor existing useful generic history helper rather than clone it.
2. Share view navigation/search, row identity, multiline detail expansion, scrolling, follow mode, and selected/filtered copy. Preserve selected ID through append and eviction; evicted selection moves to nearest retained entry with visible omission.
3. Wire `l` and `e`; latest error uses structured error when available, stderr fallback otherwise. Ordinary stderr does not automatically become a failed runtime/test state.
4. Keep history through config failure/recovery/restart. `c` clears visible console only; `x` deletes log/request history without touching test history or running work.
5. Session view shows Histoire/Node/Vite versions, root/config, actual bound local/network URLs, uptime, completed phase durations, current phase, restart reason, and available collection/MCP summary.
6. Add clipboard selected/filtered text and QR for reachable URL. Reuse existing `open` path; promote compatible already-installed clipboard/QR/width packages to explicit dependencies, with lazy imports for optional actions. Do not rely on accidental transitive imports.
7. Use configured binding/address to derive network URLs; never advertise network access from loopback-only listener. Clip or scroll oversized QR rather than break layout. No network URL is invented when no interface is reachable.
8. Keep text available after platform action failure. Preserve copy sanitization and credential redaction; applying styling must not reintroduce untrusted escapes.

## Useful tests

- Actual logs view searches distinct startup and post-recovery errors; latest-error focus finds correct record.
- Append while scrolled preserves selected ID and stops follow; End resumes. Overflow evicts oldest entries and reports omission with independent expected IDs/text.
- Multiline/Unicode content remains readable/copyable, no control injection or credential in retained/copied content.
- Missing/failing clipboard reports feedback and leaves URL visible. Test doubles only at platform clipboard boundary; do not mock navigation/history.
- Info updates after port fallback/base change/restart and does not display retired-generation version/phase as current.

## Acceptance criteria

Logs/search/copy/info work through real terminal entry, bounded memory, stable history/selection, and graceful unavailable platform actions.

## Exclusions

No browser console capture, environment dump, arbitrary secret discovery, persistent log file, or request/log correlation inference.

## Handoff receipt

Record dependency versions/why needed, history/navigation proof, platform-action boundary, QR/manual appearance check, and omissions in [evidence](evidence.md). 05/06 reuse view infrastructure.
