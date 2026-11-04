# 11 — Repository launcher, packaging, docs, and conformance

Status: **implemented, Linux-qualified** (2026-11-04, see evidence; non-Linux matrix outstanding). Dependencies: 00–10, all prior slice gates.

## Goal

Qualify complete console through repository launcher and unrelated installed consumer; document actual capability and platform limits.

## Source targets

- `scripts/dev-histoire.mjs`, current launcher integration fixture/tests.
- `packages/histoire/package.json`, `packages/histoire-dev-proxy/package.json`, existing tarball consumer/package tests and terminal integration config.
- `docs/guide/getting-started.md`, `docs/guide/testing.md`, `docs/guide/troubleshooting.md` where behavior belongs; this pack's evidence/validation/status files.

## Implementation steps

1. Adapt launcher to programmatic Nodemon API with inherited stdin, quiet supervisor output, and no competing restartable input reader. Keep one terminal input owner and retain stable root dependency resolution.
2. Preserve existing watch/ignore list, 1500 ms emitter coalescing, source-mode environment, config path forwarding, separator behavior, rebuild recovery, and generation teardown. Do not replace working launcher with independent custom supervisor.
3. Distinguish intentional clean child exit from watched SIGTERM restart. Clean quit must end launcher/watchers; rebuild still starts next child. Use actual Nodemon event semantics, never kill arbitrary parent PID or exit before child drain.
4. Run launcher through PTY and private repository fixture so rebuild probes cannot destroy shared `dist`. Test repeated rebuild/quit and raw mode restoration.
5. Verify tarballs contain new terminal/runtime modules and explicit runtime dependencies. Unrelated consumer must resolve package exports and lazy clipboard/QR imports without workspace-only/transitive accidental dependencies.
6. Extend existing packed-consumer gate with actual dev CLI console/plain/watch smoke as supported by prerequisites. Keep core unit suite independent of expensive package installation.
7. Document activation/overrides, shortcuts, test scopes, watch selection/conservative fallbacks, stop/recovery, retention, required browser packages, terminal/platform requirements, and no automatic package installation. Preserve concurrent docs changes by merging scoped additions.
8. Review code/tests for duplicated histories, graph parsers, queue owners, output patches, fixtures, vacuous tests, and modules over 300 lines. Remove only task-owned duplication and keep public compatibility.
9. Run focused suites plus existing lifecycle/browser regressions, package gate, affected builds/type checks, scoped lint, whitespace, and manual terminal scenarios in [validation](validation.md).
10. Probe four high-risk defects in isolated sources/caches: removed generation fence, first-affected-story-only selection, metadata-only watch triggering, and premature lane release. Record assertion failure and proof boundary; never mutate shared checkout for fault probes.
11. Update slice statuses/evidence only from actual gate receipts. Final report states remaining platform/infrastructure limits; do not imply CI, release, commit, or push.

## Useful tests and commands

Use command groups in [validation](validation.md#baseline-and-scoped-commands). Existing `mcp/integration/dev-launcher.spec.ts`, `dev-proxy-browser.spec.ts`, and `execution.spec.ts` protect prior shipped paths; terminal PTY/browser integration establishes new behavior. Existing package smoke alone is insufficient unless extended to exercise new modules/actions.

Packed consumer must run outside workspace, with real owned cleanup and exact listener reuse. At least one `--no-mcp` terminal workflow and one `--no-tui --test-watch` workflow must execute real tests. Manual OS/browser/clipboard behavior is recorded separately from mocked external platform-action tests.

## Acceptance criteria

- All prior slice gates recorded and no accepted feature silently omitted.
- Direct CLI and repository launcher support input, rebuild, recovery, and clean quit; no leaked runtime/test/supervisor process or terminal state.
- Installed consumer resolves every shipped/lazy dependency and starts real console/plain path.
- Existing regression gates and affected checks pass, or specific unresolved blockers prevent full completion claim.
- Manual platform matrix distinguishes Linux verification from unverified macOS/Windows/multiplexer cases.
- Documentation describes final behavior and evidence limits; final task-owned source/test review complete.

## Exclusions

No commit, stage, push, release, publication, remote CI dispatch, or platform-support claim without evidence. Do not treat missing browser/PTY infrastructure as passing conformance or invent replacement mocked proof.

## Handoff receipt

Append final [evidence](evidence.md#final-conformance) receipt with exact source state, all gate outcomes, fault sensitivity, packed consumer, platform versions, cleanup observations, deviations, and remaining blockers. Update README milestone status only after actual qualification. A handoff must distinguish implemented-but-unverified work from completed behavior.
