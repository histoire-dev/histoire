# 05 — Setup check and targeted repair UX

Prerequisite: [04](04-shared-runtime-adoption.md). Completes M2.

## User outcome

User checks setup, sees selected browser if working, or receives one relevant next action. Installing an automation driver does not automatically imply downloading Chromium. Re-check stops escalation as soon as an existing setup works.

## Owned files

New:

- `packages/histoire/src/node/commands/screenshot-setup.ts`
- `packages/histoire/src/node/server/ui-channel/screenshot-setup.ts`
- `packages/histoire-app/src/app/components/canvas/toolbar/ScreenshotSetup.vue`
- `packages/histoire-app/src/app/components/canvas/toolbar/use-screenshot-setup.ts`
- `packages/histoire/src/node/__tests__/screenshot-setup-command.spec.ts`
- `packages/histoire/src/node/__tests__/ui-screenshot-setup.spec.ts`
- `packages/histoire-vue/src/__tests__/workbench-screenshot-setup.spec.ts`

Existing: `node/bin.ts`, UI channel registration/validation, shared setup/event types, toolbar `ScreenshotPopover.vue`, existing shell loading/empty components and shortcut/overflow fixtures as needed. Put command parsing/report serialization in small modules if command approaches 300 lines.

## CLI contract

```sh
# Metadata only; no browser launch, Vite, collection, or install.
pnpm exec histoire screenshot-setup --root /absolute/project --json

# Explicit finite launch/probe of available setup candidates.
pnpm exec histoire screenshot-setup --root /absolute/project --check
```

Options: `--root`, `--config`, `--check`, `--json`. No install flags or arbitrary browser CLI arguments. Default root is cwd; config resolves through existing trusted config loader. Do not create Vite/story collection to load a setup policy. CLI uses its own execution lane for the check and drains owner/lane before exit.

Exit codes: 0 for discovery with at least one potential candidate or successful check; 1 for definite needs-action/exhausted check; 2 for invalid CLI/config arguments. JSON includes portable snapshot only; text labels unverified state clearly. `--json` stdout contains one JSON object and no incidental logging. Sanitize config-loader output/redirection deliberately; never mix JSON with progress text.

## UI contract

- Opening popover requests `read` only. No automatic probe/download each time toolbar is shown.
- First capture itself runs progressive acquisition, so user need not click “Check setup” before normal capture.
- Pending explicit check uses `WorkbenchLoadingState` with title “Checking screenshot setup”. Inline indicators use `HstPulsatingDisc`.
- Success: concise “Ready” and renderer label. Failure: `WorkbenchEmptyState` title “Screenshot setup needed”, one targeted detail/action.
- Actions: “Check setup”, “Check again”, “Copy command”. No “Install” button that executes external application changes.
- Installer guidance is shown when relevant only. Keep source labels: “Chromium headless shell”, “Chromium”, “Google Chrome”, “Microsoft Edge”, “Configured browser”. No colored borders/status edge bars or unnecessary explanatory copy.
- Disconnect/unmount cancels only owned explicit check; it cannot cancel current capture or another client. Shared toolbar overflow must preserve pending work through relocation just as capture currently does.

## Repair serializer

Own fixed canonical pnpm command specs in setup/report module; UI and CLI render the same specs:

- Driver: `pnpm add -D playwright`. Alternative core-only setup appears in docs, not simultaneous mandatory installs.
- Shell: `pnpm exec playwright install chromium --only-shell`.
- Existing core driver: use `pnpm exec playwright-core install chromium --only-shell`; don't use missing playwright CLI or unpinned `npx` download.
- OS libraries: selected-driver CLI `install-deps chromium` on supported Linux. UI labels system-package privileges separately; never runs it.
- Explicit full: selected-driver CLI `install chromium --no-shell`, accompanied by trusted config example `browser: { source: 'chromium' }` in CLI/docs. Automatic repair only when shell-specific incompatibility is actually classified.

Canonical examples use pnpm; label as such rather than pretending Histoire chose another project's package manager. Documentation can provide npm equivalents. All commands are static allowlisted tokens; any shell copy serializer must correctly quote tokens. Do not append project paths/config strings to copied installer commands.

## Tests first

1. Driver absent + Chrome installed: only driver action; check after simulated driver install succeeds with no browser download suggestion.
2. Driver present + no browser: shell action; no full Chromium/Vitest/provider action.
3. Missing OS libraries: targeted system action; permission/unknown/story failures do not suggest full download.
4. Check succeeds: no repairs remain; check again refreshes dependency discovery and candidate choice after external installation/removal. Upgrading an already imported driver at same path shows “Restart Histoire”, not a false ready result.
5. UI `read` invokes no launch; `check` admits one lane job; duplicate request IDs and oversized payloads rejected.
6. Different clients cannot cancel each other's check; generation change/unmount suppresses late response.
7. CLI JSON parses, matches bounded portable schema, carries no absolute executable paths/stderr, and leaves no processes/listeners.
8. Keyboard/button interactions and clipboard error feedback work. No assertions on presentation classes/styles.

## Acceptance

CLI and UI show same reason/source/repair progression. Normal capture works without prior explicit check. No package/browser/system installation or config write occurs. UI follows shell components/loading rules, strict wire budgets, and stale-owner suppression.

## Handoff

Record command help/exit-code proof, screenshot of key UI states if useful, and behavior tests. Continue to 06 for deployment-machine configuration and optional driver packaging.
