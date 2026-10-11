# 06 — Node deployment portability

Prerequisites: [04](04-shared-runtime-adoption.md), [05](05-check-and-repair.md).

## User outcome

Copied Node artifact discovers its target machine's existing browsers. Build-machine cache/executable paths are never baked into artifact or treated as proof of production availability.

## Owned files

Existing `packages/histoire/src/node/deploy/{server,execution,options,entry,artifact-schema,artifact-version}.ts`; `build/node/{snapshot,runtime-settings,package,bundle,validate-bundle}.ts`; `mcp/browser/inspection/task.ts` and compiled Node test adapter if owner threading requires it. Existing `__tests__/mcp/{package-smoke,build-config}.spec.ts`, deployment integration, SDK built-source capture tests, and consumer helpers.

Inspect generated entry/bootstrap wiring before editing; use existing deployment environment parser in `deploy/options.ts`, not a second config-loader runtime depending on project source.

## Deployment policy

1. Default deployment source is `auto`, resolved on target machine.
2. Optional environment `HISTOIRE_BROWSER_SOURCE` accepts `auto`, `headless-shell`, `chromium`, `chrome`, `msedge`, `executable`. For `executable`, require `HISTOIRE_BROWSER_EXECUTABLE_PATH`; reject incompatible path/source combinations.
3. Relative target paths resolve against real artifact root; no source config, ambient build cwd, or serialized absolute development path.
4. Do not serialize `HistoireConfig.browser.executablePath` into manifest. Runtime deployment choice is environment-owned. Build logs/docs may explain explicit target configuration, without recording path in public artifact metadata.
5. Preserve pinned optional driver version. If selected build driver is playwright, emit optional playwright as today. If core-only, emit optional playwright-core. Emit at most one selected driver package/version. Do not emit project/Vitest dependencies for compiled Node tests.
6. Build manifest wire shape need not change just to carry browser source. Avoid schema-version churn; package metadata can represent driver kind without leaking machine locations. If existing snapshot needs a private driver descriptor, keep it outside public manifest payload.
7. A previously built artifact with optional playwright keeps working; no new environment variable required. Driverless artifact keeps serving catalog/content and exposes capture unavailable with smallest next action.

## Integration steps

1. Replace playwright-only deployment dependency presence checks with shared driver resolver and launch-free setup inventory.
2. Create target-machine owner in deployment source bootstrap; share with screenshot, isolated inspection, and compiled-test sessions. Preserve host token/origin authentication.
3. Thread owner through `NodeExecutionValue`, `resolveNodePreviewOptions`, and SDK built-source hosting. Existing injected `input.launch` remains authoritative for fixtures/hosts.
4. Generalize `resolveBuildPlaywrightVersion` to selected driver descriptor without duplicating discovery logic. Keep generated optional package deterministic and pinned to exercised version.
5. Adjust bundle validation to include new setup modules while excluding project config/Vite/source code. Ensure server can execute from copied directory outside monorepo.
6. On deployment shutdown, stop admission/mark inactive, drain operation cleanup, close owner, then close host/transport/listener using existing ownership. Unknown cleanup remains terminal.
7. Keep development CLI guide and generated-artifact repair guide distinct: standalone artifact may not have Histoire CLI installed, so use selected-driver install/check instructions and server capability result.

## Useful tests first

- Build with a private custom development executable: generated manifest/package/server has no such path.
- Core-only build emits core optional dependency; copied artifact launches supported target browser with no playwright package installed.
- Build machine has shell; target machine has only Chrome: target chooses Chrome, not stale shell path/ready receipt.
- Target `HISTOIRE_BROWSER_SOURCE=chrome` with no Chrome: explicit-choice failure, no shell fallback.
- Driverless target: catalog works, capture reports missing driver, no browser install attempted.
- Legacy artifact optional playwright remains compatible.
- Deployment check/capture cancelled during shutdown cleans owned attempt and does not publish completed artifact.
- Compiled tests keep test runtime requirement and do not inherit deterministic screenshot CSS unexpectedly.

## Acceptance

Packed/copied Node consumer passes native startup/catalog plus real capture on target-specific browser setup. Existing MCP schemas, protected HTTP behavior, artifact verification, compiled tests, and cleanup contracts pass. No build-machine paths/secrets/probe receipts leak into artifact.

## Handoff

Record generated package contents, driver version/kind, target browser/OS, copied-artifact evidence, and known unsupported platforms. No deployment/publication performed without separate authorization.
