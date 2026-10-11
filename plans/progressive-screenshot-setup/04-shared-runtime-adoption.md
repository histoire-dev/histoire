# 04 — Shared runtime adoption

Prerequisite: [03](03-progressive-acquisition.md). Completes M1 when all development capture entrypoints pass.

## User outcome

Canvas, Node SDK, MCP HTTP/stdio, and rendered inspection choose browsers using one policy. A browser that makes manual capture work also makes agent capture work under the same runtime authority.

## Owned files

- Development/source owners: `runtime/dev-session.ts`, `runtime/controller.ts`, `server/index.ts`, `server/dev-events.ts`.
- UI: `server/ui-channel/{index,screenshot,screenshot-service}.ts`; shared `types/ui-channel.ts` for optional setup error payload.
- SDK: `api/{project,internal,capture,preview}.ts`; `runtime/hosting/preview.ts` for independent built-source ownership.
- MCP: `mcp/browser/dev.ts`, `mcp/project/{capabilities,dev-facade}.ts`, `mcp/browser/inspection/task.ts`, `mcp/transport/{worker-runtime,worker-project}.ts`.
- Existing tests: UI screenshot suites, `mcp/{capabilities,screenshot,worker-client,worker-ipc}.spec.ts`, SDK embed capture/lifecycle suites. Add focused tests to existing source-owner fixture rather than duplicate source-runtime harness.

Deployment adapters are completed in 06. Do not duplicate acquisition in deployment while implementing this slice.

## Integration rule

Create one setup owner per isolated execution source/generation and pass it explicitly to session options. UI/MCP/SDK using the same dev source share its owner. Independent built source has independent owner. Existing shared execution lane remains the sole scheduler. A owner may not outlive its source or restart into a successor.

Do not store owner on a global registry keyed only by cwd. If existing root owners are in `ProjectServices`, pass captured source owner with target options and invalidate it with source epoch/config revision. Exposing a setup getter in private services does not add public SDK results.

## Useful tests first

1. UI and SDK/MCP session arguments select same configured source and normalized policy.
2. MCP stdio worker honors selected config file/root, including core-only project; parent process doesn't choose its own browser dependency.
3. Metadata read performs no launch; unknown shell yields unverified potential availability; exhausted explicit setup check yields targeted unavailable reason.
4. Lane quarantine overrides setup success in capability projection; cached `ready` cannot revive unavailable execution service.
5. Config restart during delayed acquisition retires owner before successor; old completion cannot save files, return pixels, or publish ready.
6. Two concurrent UI requests preserve cancellation owner isolation and queued per-target props snapshots.
7. Successful batch target followed by failure retains first file and classified second error, within complete event byte budget.
8. Development test availability remains based on project Vitest/provider/playwright; installing core for screenshots does not enable tests incorrectly.

## Changes

1. Thread trusted `ctx.config.browser` and source `isActive` through UI and MCP resolvers. No browser settings accepted in screenshot wire input.
2. Add owner to private source values used by SDK capture and MCP dev adapters. Each task captures owner/policy synchronously with catalog/epoch before queueing.
3. Extend session options to accept owner while keeping `launch` injection authoritative. Rendered inspection uses same owner; no own discovery/cleanup implementation.
4. Update capability detector to shared discovery information without launch. Do not import full browser session into catalog-only reads. Driver/candidate inventory may be asynchronously precomputed on source creation and later reflected in live facade.
5. Audit facade lifecycle: current `dev-facade` stores initial capability projection. Derive later setup health from owner snapshots on `getProject`, so exhausted checks/refresh are observable without replacing catalog revision. Preserve strict worker project schema.
6. Project close/restart invalidates owner, drains execution, closes owner resources, then retires host/server. Preserve current `onBeforeRelease` and execution-owner contracts; don't double-close shared lane across adapters.
7. Add optional setup payload to root complete-failure error and optional top-level setup to partial-success result. Per-target error rows strip setup. Choose first setup-classified target failure in target order for the single shared diagnostic. Update `largestScreenshotError`/worst-case complete-event admission to reserve 8 KB once in addition to existing worst-case row sizing. Verify 64 ordinary short-ID frames still fit; reject only genuinely over-budget complete events. UI reads shared diagnostic once; don't shorten identities to fit.
8. Keep MCP input/output schemas and resource results unchanged. Use existing deliberate `DEPENDENCY_MISSING` / `BROWSER_UNAVAILABLE` mapping with short scrubbed instruction messages, not portable setup DTO added to strict tool output.

## Acceptance

Focused adapter/lifecycle/worker tests pass. One real dev project captures same variant via UI, Node SDK, and MCP using a selected existing-browser setup. No install action occurs; no Node/driver executable path leaks into UI/worker public data. Existing capture dimensions/background/props/results remain unchanged.

## Handoff

Document source-owner construction/disposal seams, capability meaning, exact UI error-byte handling, and cross-entrypoint evidence. M1 excludes new setup screen/CLI and standalone Node deployment until 05–06.
