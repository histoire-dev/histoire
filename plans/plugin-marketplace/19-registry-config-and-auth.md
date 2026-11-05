# 19 — Registry config and authentication

Status: **complete**. Dependencies: 14–18. Wave 8.

## Goal

Read npm registry settings the way package managers do, so private and scoped registries work for catalog, detail, update and suggestion requests.

## Behavior

- New `NODE/marketplace/catalog/npm-config.ts` resolves, in npm precedence order: `npm_config_*` env, project `.npmrc` (project root, then workspace root), user `.npmrc` (`$HOME/.npmrc` or `npm_config_userconfig`). Global npmrc is out of scope.
- Supported keys: `registry`, `@scope:registry`, `//host/path/:_authToken`, `//host/path/:_auth`, `//host/path/:username` + `:_password` (base64), with `${ENV}` expansion. Unknown keys ignored.
- `registryFor(id)` picks the scope registry for scoped packages, else the default.
- Credentials attach only when the request URL starts with the credential's nerf-dart prefix (same host and path prefix, https or http as configured). Never on redirects (fetch keeps `redirect: 'error'`), never in cache keys, never in job output, receipts, UI replies or error messages.
- Search (`keywords:histoire-plugin`) goes to the default registry; packuments go to `registryFor(id)`.
- `RegistryOptions.registryUrl` stays as the test override.

## Owned files

- `NODE/marketplace/catalog/{npm-config.ts,registry.ts}`
- `NODE/marketplace/changes/resolve-plugin.ts`, `NODE/marketplace/migrations/releases.ts`, `NODE/marketplace/inventory/registry-versions.ts`: replace duplicated endpoint/key computation with one exported helper from `npm-config.ts`/`registry.ts`.
- Specs under `packages/histoire/src/node/__tests__/marketplace/` (reuse the existing fixture registry server; add auth-header checks to it).

## Implementation steps

1. Write failing specs (temporary project dirs; set `HOME` to a temp dir in tests):
   - Precedence: env over project over user.
   - Scoped registry used for `@acme/plugin-x`; default for unscoped.
   - Fixture server requires `Authorization: Bearer <token>`: request succeeds with matching nerf-dart, and a second fixture host on another port never receives the header.
   - `${ENV}` expansion; missing env leaves the credential unset.
   - Cache key for the same URL is identical with and without a token; cache files and channel replies contain no token string.
   - A 401/403 maps to the existing `community: 'error'` state with a message that names the registry host, not the token.
2. Implement; keep files under 300 lines.

## Acceptance criteria

- Specs pass; existing catalog specs pass; `rg` over spec temp outputs finds no token.

## Exclusions

- Writing npmrc, login flows, global npmrc, certificates/proxies (`cafile`, `proxy`).
