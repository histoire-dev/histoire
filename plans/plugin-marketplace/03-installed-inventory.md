# 03 — Installed inventory

Status: **complete**. Dependencies: [01](01-contracts-and-scaffolding.md). Wave 2. Source acceptance recorded in [receipt](receipts/03.md); fresh-dist checks remain unrun.

## Goal

Know, for every configured plugin: package name, installed version, local or workspace origin, required flag, enabled state, and available update. Expose it to the app and to the catalog and jobs.

## Owned files

- `NODE/marketplace/inventory/{index,package-resolve,updates,handlers}.ts`. `handlers.ts` replaces the stub and implements `marketplace-updates`.
- `NODE/config/plugin-metadata.ts`: add `packageName` and `version`, resolved from the installed package's `package.json`.
- `NODE/config/plugin-toggle-inventory.ts`: pass the new fields through, plus `required`.
- `NODE/virtual/resolved-config.ts` and `packages/histoire-app/src/virtual.d.ts`: extend the `installedPlugins` row with `packageName?`, `version?`, `local: boolean`, `required: boolean`, `official: boolean`.
  - 01 already edited `virtual.d.ts` for the official virtual module. This slice edits only the `installedPlugins` declaration. Wave 2 has no other editor.
- Specs `NODE/__tests__/marketplace/inventory-*.spec.ts`. Extend the existing `plugin-inventory.spec.ts` only where its fixtures already cover the case.

## Implementation steps

1. Resolve the package for each plugin:
   - The plugin `name` is often the npm name. Otherwise, map it via the import specifier recorded by `analyzePluginSource` for that entry.
   - Read the version from the installed package's `package.json`, not the range in the project manifest.
   - Workspace (`workspace:`), `file:` and `link:` dependencies, and configs that import relative files, are `local` with version `local`.
2. `required`: builtins (`builtin:` prefix), plus any plugin whose manifest category is `frameworks` and whose framework matches the project's detected framework. Required plugins can't be removed or disabled from the marketplace.
3. `official`: package listed in the bundled official index and under the `@histoire/` scope.
4. Export `getInstalledIndex(ctx): Map<PluginId, CatalogEntry['installed']>`, cached per generation, for 02 and 06.
5. Updates:
   - `marketplace-updates` uses 02's registry client via a catalog export. If 02 isn't merged yet, inject the client as a parameter and record the wiring in the receipt.
   - An update is the highest version that is semver-greater, compatible, not deprecated, and not in `prefs.skippedVersions`.
   - `breaking` is true when the target version's `releaseNotes` contain `breaking` or a major bump.
   - Cache for 1 h. Pinned exact versions in `package.json` still report updates but are labeled pinned (record the field in the receipt if the contract needs it).
6. Keep `toggleId` generation semantics unchanged.

## Useful tests

- Name ≠ package (import specifier mapping).
- Installed version wins over the range.
- Workspace or local plugin.
- Builtins and framework plugins are required.
- Spoofed official.
- An update skips deprecated and skipped versions.
- An incompatible newer version is not offered.

## Acceptance criteria

- `installedPlugins` carries the new fields in dev and static output.
- Existing settings specs still pass.
- The updates handler answers per contract.

## Exclusions

- UI changes.
- Installs.
