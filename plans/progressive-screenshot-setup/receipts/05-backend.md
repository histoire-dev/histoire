# Slice 05 backend receipt — 2026-10-08

Status: backend and CLI implemented; setup UI behavior is covered by the sibling UI receipt.

Added `histoire screenshot-setup [--root <directory>] [-c|--config <file>] [--check] [--json]`. Metadata discovery is read-only and does not start Vite, collect stories, launch a browser, or install packages. `--check` submits one bounded probe to an execution lane and releases its lease before output. The command loads only the trusted Histoire config file; browser policy supplied only through `vite.config.ts` does not apply.

JSON stdout contains one portable snapshot, or a fixed `{ error: { code, message } }` object. Metadata exits 0 for unverified or ready state and 1 for needs-action. Checks exit 0 only when ready; unavailable or cleanup-uncertain checks exit 1. Invalid arguments, roots, or config exit 2. Invalid argument output shares one fixed renderer with the bin entry point, so raw arguments never enter JSON.

Registered the setup UI channel. `read` and `refresh` only discover metadata; explicit `check` uses the shared execution lane with a 15-second deadline and releases its lease. Cancellation is scoped to the originating client and request ID. Classified setup failures return their frozen portable needs-action snapshot and static repairs; cancellation, queue, cleanup, and unknown failures remain generic. Request schemas are strict, results are capped at 8 KB including the Vite event envelope, and channel teardown cancels and drains only setup-owned work.

Changed files:

- `packages/histoire/src/node/commands/screenshot-setup.ts`
- `packages/histoire/src/node/commands/screenshot-setup-args.ts`
- `packages/histoire/src/node/bin.ts`
- `packages/histoire/src/node/server/ui-channel/screenshot-setup.ts`
- `packages/histoire/src/node/server/ui-channel/screenshot-setup-validation.ts`
- `packages/histoire/src/node/server/ui-channel/index.ts`
- `packages/histoire/src/node/__tests__/screenshot-setup-command.spec.ts`
- `packages/histoire/src/node/__tests__/ui-screenshot-setup.spec.ts`

Validation:

- Focused CLI and UI-channel tests passed: 2 files, 14 tests. Tests exercise config-output suppression, metadata read without browser launch, one lane check, duplicate request rejection, exact-client cancellation, source-retirement suppression, classified shell repair, canonical core-upgrade validation, unallowlisted-command rejection, and result/request bounds. The external Playwright driver boundary is mocked; owner, reporting, channel, and CLI logic remain real.
- Package `tsc --noEmit`: passed.
- Targeted ESLint and `git diff --check`: passed.
- Compiled `bin.mjs` metadata invocation returned one unverified JSON snapshot with exit 0. Compiled invalid-config and unknown-option invocations each returned one fixed JSON error with exit 2; config console output did not leak. No browser was launched and no packages were installed.
