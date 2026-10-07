# 12 — DevTools hosts, middleware, and static reports

## Outcome and prerequisites

Depends on: 08, 11. Mount Histoire integration in existing Devframe/Vite/Nuxt hosts and provide explicit historical report export.

## Owned files

- New `packages/histoire-devframe/src/node/hosting/`, `src/dock/`, and `src/report/`.
- Small optional standalone integration module under Histoire Node server/hosting; no adapter import when disabled.
- Existing SDK host examples extended later by 14; this slice owns reusable hosting fixtures and integration tests.
- Report schema/serializer and plain read-only report rendering adapter.

## Tests first

1. Mount at nested base on caller HTTP/HTTPS server; unrelated routes/WebSockets survive initialization, restart, partial failure, and disposal.
2. Existing hub context remains intact; installing Histoire twice rejects/reuses explicitly without duplicate scripts or mounts.
3. Dock binds intended source/session, not shell or another tab; cross-origin book still uses authenticated Histoire bridge.
4. Agent endpoint absent when disabled/missing optional peer; registry removed on shutdown and no secret written to descriptor.
5. Offline report opens without backend, shows historical owner/time, contains only selected bounded data, and offers no live commands.

## Implementation steps

1. Mount tested Devframe definition using host's kit/standard handler. Host chooses base, origins, identity policy, and MCP enablement explicitly.
2. Add optional Histoire standalone integration via lazy adapter resolution. Keep API host-owned; never start second book or global hub runtime.
3. Build dock from exported Vue panels or embedded explorer subset using supplied session. Reuse existing hub client context; do not call context creation again in arbitrary story frames.
4. Connect editor service only through verified source references and existing permission policy. Generic Devframe Inspector sees curated adapter registry, not raw controllers.
5. Provide explicit `exportHistoireInspectionReport({ results, diagnostics? })` Node helper returning versioned bounded report data and build input; host supplies output directory to report build adapter. No automatic export on inspection.
6. Report records schema version, source/build identity if known, observation interval, truncation/loss, and historical mode. Exclude pairing grants, credentials, live registry IDs that act as handles, absolute paths, and mutation handlers.
7. Static book local runtime inspection and static report are separate modes; report renderer cannot claim current DOM or reopen live lease.

## API changes

Optional hosting helpers documented against pinned kit versions; explicit report export helper. Definition remains reusable with standard Devframe handler without mandatory Vite/Nuxt dependency in Node core.

## Failure paths

Unknown host API/version fails with useful capability error, not global context replacement. Missing report data remains absent. Host close owns listeners; adapter close only removes its mounted routes/owned registrations.

## Validation commands

Real host middleware/HTTPS/nested-base tests, pinned Vite/Nuxt dock consumer smoke tests, offline report browser test, static opt-in/opt-out bundle checks.

## Acceptance criteria

Working DevTools dock and standalone optional integration share SDK services; caller host survives disposal; explicit report is readable offline and cannot invoke live actions.

## Non-goals and handoff

No replacing Vite/Nuxt DevTools, terminal/git/code-server features, automatic publication, or static network MCP server. Hand off supported host/version matrix and report format to 14.
