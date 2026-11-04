# 03 — Terminal surface, activation, and input lifetime

Status: **complete** (2026-11-04, see evidence). Dependencies: [01](01-runtime-bridge-and-output.md), [02](02-progress-and-restart-reasons.md).

## Goal

Ship pinned main panel, usable main actions, honest plain fallback, and terminal restoration through real CLI.

## Source targets

- `packages/histoire/src/node/bin.ts`, `commands/dev.ts`.
- New `node/terminal/{session,support,surface,keys,panel,plain,actions}.ts`; split further before exceeding 300 lines.
- New `node/__tests__/utils/terminal/` PTY helper, `node/__tests__/terminal/`, terminal integration config/script; current core Vitest exclusion list.

## Implementation steps

1. Register only TUI flags in this slice. Resolve environment/CLI policy exactly as [contracts](contracts.md#activation-and-flags); watch flag waits for slice 10's implementation.
2. Create terminal controller before proxy binding without importing project/runtime graph. Bind callback updates immediately; lazily initialize optional platform helpers.
3. Implement normal-screen panel, stdout/stderr log insertion above panel, and alternate-screen host for help/detail content. Truncate/wrap by display width, including wide Unicode, without spilling beyond terminal budget.
4. Decode keys via `node:readline`; own raw mode and reader subscription. Preserve prior raw/cursor/input lifetime and release only owned listeners. Search/help key context must not accidentally dispatch main actions.
5. Implement main restart/fresh restart/open/clear/help/quit. Until later view slices exist, show unavailable action plainly rather than promise functioning detail views. Full milestone still requires them.
6. Plain reporter retains URL discovery lines, real lifecycle/progress, and no TUI control escapes. Interactive plain input supports finite line commands; piped stdin adds no reader.
7. On small resize leave screen/input cleanly, switch reporter, retain state; on recovery reattach once. Renderer failure falls back permanently for session. Handle SIGINT/SIGTERM and Unix suspend/resume through same owned lifetime.
8. Quit blocks new actions first, restores terminal even if proxy close fails, then joins existing shutdown and reports cleanup failure without masking nonzero status. No forced process exit before cleanup.
9. Add reusable PTY harness invoking built CLI, with bounded output/actions/resize/shutdown. Add explicit integration config; exclude terminal integration folder from ordinary core tests.

## Useful tests

- Actual CLI in PTY: panel address appears before held config; `r` starts real replacement; `R` uses fresh path; `q` exits and exact port rebinds.
- Piped output and `--no-tui` preserve URLs and logs with no cursor-control output; stdin reader does not retain process after close.
- CLI/env precedence, CI/inspector override limits, missing raw capability, dumb terminal, 39-column/9-row fallback and recovery.
- Search/help do not dispatch unrelated main actions. Ctrl+C always exits.
- Inspect real PTY termios before/after exit/suspend/resume and verify screen/cursor restoration. Pure support-policy tests supplement but do not replace this.
- Render failure leaves real server working through plain reporter; no duplicate key listeners after repeated resize cycles.

## Acceptance criteria

Core actions operate through actual CLI. Terminal restoration, owned process exit, and listener reuse are demonstrated. Fallback does not stop server or corrupt output.

## Exclusions

No completed detail-view, test-watch, or platform-compatibility claim from panel alone. No production native PTY dependency, Vue terminal renderer, or app styling change.

## Handoff receipt

Record mode matrix, PTY prerequisite/platform, actual commands, control restoration checks, and remaining platform gaps in [evidence](evidence.md). 04 reuses surface/navigation rather than adding competing raw input owner.
