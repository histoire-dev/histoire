# 01 — Headless-only installation guidance

Prerequisites: none. Milestone M0. This slice changes instructions, not browser selection.

## User outcome

Normal screenshot setup installs only the existing runtime's headless shell. User avoids downloading full Chromium that current screenshot launcher does not use.

## Owned files

- `docs/guide/ui-screenshots-mcp.md`
- `docs/guide/mcp.md`
- `docs/guide/deploy-node.md`
- `packages/histoire/src/node/runtime/browser/dependencies.ts`
- `packages/histoire/src/node/server/ui-channel/screenshot-service.ts`
- `packages/histoire/src/node/server/ui-channel/screenshot.ts`

Inspect existing exact-message assertions in `__tests__/ui-screenshot.spec.ts`, `ui-screenshot-channel.spec.ts`, and MCP package tests. Update only assertions affected by actionable instruction changes. Do not add source-text or documentation-string tests.

## Changes

1. Replace screenshot/isolated inspection setup command with:

   ```sh
   pnpm add -D playwright
   pnpm exec playwright install chromium --only-shell
   ```

2. Update launch-unavailable error to use `--only-shell`. Keep `DEPENDENCY_MISSING`, `BROWSER_UNAVAILABLE`, retryability, and transport error codes unchanged.
3. Update `largestScreenshotError` in `server/ui-channel/screenshot.ts` together with UI error projection. Its value participates in worst-case response-byte admission; changing only displayed message can invalidate that bound.
4. Add a brief screenshot-specific note that already installed browsers remain untouched and headed Vitest work may still require full Chromium. Do not replace all `install chromium` commands indiscriminately, especially general browser testing guidance.
5. Explain supported Linux OS-library command separately from normal shell install. Do not instruct users to install all Playwright browsers or disable sandbox globally.

Until later slices ship, installed Chrome alone is not enough for this runtime. Do not document proposed browser config or discovery as available in this slice.

## Validation

- Read updated docs/errors together; verify copy remains accurate for existing default launcher.
- Run affected screenshot UI/channel tests, especially response byte-budget cases.
- Use selected project Playwright CLI `install --dry-run chromium --only-shell` in an existing environment. Confirm output lists shell/FFmpeg and no full Chrome. Dry run must not install packages or mutate browser cache.
- Run whitespace check on changed files. Guidance-only change needs no browser benchmark or new regression suite.

## Acceptance

Default instructions and both server/UI error projections consistently offer shell-only install. Existing byte-budget tests pass. No launch policy, public schema, dependency manifest, test-engine prerequisite, or cleanup behavior changed.

## Handoff

Record exact changed guidance, dry-run package version, and focused checks. Mark only M0 enabled. Continue to 02 for installed-browser discovery.
