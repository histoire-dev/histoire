# 15 — Official release history

Status: **complete**. Dependencies: 01–13. Wave 7.

## Goal

Bundle per-version history for official plugins, so that with community plugins off (no registry requests):

- The update dialog shows every intervening release note and selects migrations across skipped versions.
- The Versions tab lists real past versions with compatibility.
- A peer conflict on an official plugin suggests an older compatible version.

## Data model

- Each official package keeps a committed `packages/histoire-plugin-<name>/marketplace-history.json`: an array of `{ version, requires, frameworks, releaseNotes?, migrations?, publishedAt? }`, newest first, at most 50 entries, validated with the existing manifest validator for `releaseNotes`, `migrations` and `requires`.
- The file is not in the package's published `files`; it only feeds the generator.
- `pnpm marketplace:history` (new root script, new `scripts/marketplace/snapshot-official-history.mjs`) appends the current `package.json` version and manifest fields if that version is missing. It is idempotent. Release tooling can call it before `marketplace:index`.
- The generator adds a node-only `history` array to each `official.json` entry and fills `versions` from it (newest first, `compatible: true` placeholder as today).
- `resolved-marketplace-official.ts` strips `history` from the static virtual module (static builds never update).

## Owned files

- `scripts/marketplace/{generate-official-index,snapshot-official-history}.mjs`, root `package.json` script entry.
- `packages/histoire-plugin-*/marketplace-history.json` (new, seeded with the current version only — never invent past releases).
- `NODE/marketplace/catalog/{official.ts,official.json}`
- `NODE/virtual/resolved-marketplace-official.ts`
- `NODE/marketplace/inventory/registry-versions.ts` (official branch only)
- `NODE/marketplace/migrations/releases.ts` (official branch only)
- `NODE/marketplace/jobs/failure.ts` (`suggestVersion`)
- Specs under `packages/histoire/src/node/__tests__/marketplace/` for these modules (extend existing official/drift/update/failure specs; don't add a parallel fixture set).

## Implementation steps

1. Write failing specs using a fixture official entry with three history versions:
   - `readReleases` with community off returns one `PluginDetail` per history entry (history fields over the current entry), and makes zero registry requests.
   - `updateDetails` from the oldest to the newest version merges both newer versions' notes and migrations.
   - The update reader lists all history versions with compatibility evaluated per version `requires`.
   - `suggestVersion` for an official plugin with community off picks the newest stable history version whose `requires[peer]` accepts the found peer; it never contacts the registry.
   - Drift test: `official.json` equals a fresh generation including `history`.
   - Snapshot script: adding a version appends once; re-running changes nothing; invalid manifest fields are dropped with a diagnostic.
   - The static virtual module contains no `history` key.
2. Export a node-only `officialReleases(id): PluginDetail[]` from `official.ts`. Keep `officialPlugins` shape for existing consumers.
3. In `failure.ts`, use `officialReleases` for bundled official ids; keep the registry path for community ids when community is on. Call sites stay unchanged (the `prefs.community` gate in `execute.ts` must not block official suggestions: if it does, record the one-line `execute.ts` change as a deviation for the orchestrator).
4. Run the generator to refresh `official.json`.

## Acceptance criteria

- Specs pass; community-off flows make zero registry requests (fixture server request count is 0).
- Bundled history entries are bounded (50 versions, existing string limits).

## Exclusions

- Back-filling real historical releases (needs release data; seeded files hold the current version only).
- Community plugin history (already comes from packuments).
