# 27 — Visual polish: settings, manage menu, update dialog, spotlight

Status: **complete**. Wave 12 (parallel with 24, 25, 26). Follow the shared rules in [24](24-polish-browse.md#shared-rules-for-slices-2427). Boards: `Main`, `7A-Spotlight`, `7B-Manage`, `7C-Update`.

## Owned files

`APP/components/pages/settings/PluginsSection.vue`, `APP/components/pages/settings/plugins/**`, `APP/components/marketplace/update/**`, `APP/components/marketplace/spotlight/**`. Consume `PluginTile` (owned by 24) without editing it.

## Fixes

1. Plugins page per Main: title row with primary "Browse marketplace" (search icon) on the right; "Installed" card whose header row holds the title and "Update all"; rows with tinted `PluginTile` (36px; derive monogram/tint for local plugins from the name when no catalog data), bold name, mono muted package, mono version column, update chip button (arrow-up icon + version, link color), options gear, Required chip, switch; More actions menu per 7B.
2. Keep matching other settings sections (same section spacing and card treatment as Appearance), so the page doesn't look foreign.
3. Marketplace preferences card per Main (rows: bold label + muted description, control right).
4. Update dialog per 7C and spotlight card per 7A: same tokens, card radius, chips and button hierarchy.

## Acceptance

- Vue settings/update/spotlight specs pass (except the 2 known stale plugin-kit spotlight cases); styling guard; ESLint clean.
