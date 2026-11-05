# 28 — Official plugin logos

Status: **complete** (orchestrator, 2026-11-05). Wave 13.

## Decision

- Each official package keeps a monochrome `marketplace-logo.svg` next to `package.json` (not published: excluded by `files` allowlists or `.npmignore`). Framework and service marks come from Simple Icons (CC0), feature glyphs from Carbon (Apache-2.0), both already in the repo's dependency graph:
  - a11y `carbon:accessibility-alt`, designs `carbon:color-palette`, screenshot `carbon:camera`, vue-devtools `carbon:debug`
  - nuxt, percy, quasar, react, svelte, vue (`vuedotjs`): Simple Icons
- `generate-official-index.mjs` embeds the file as a `data:image/svg+xml` `logoUrl` after rejecting scripts, styles, event handlers, `href` and `url(`. Community manifests still only accept `https` logos.
- `PluginTile` draws bundled data URI logos as a CSS mask in the plugin's tint (same technique as `AgentLogo`), so they follow light and dark themes; remote logos stay `<img>`; monograms remain the fallback.

## Also fixed

- Switching between Discover and All plugins briefly rendered the other section's page. The store records the section of each page (`pageView`); `CatalogState` renders only its own section's page and shows loading meanwhile.

- Builtin plugins (Tailwind CSS tokens, Vanilla) use bundled Simple Icons marks from `APP/components/pages/settings/plugins/builtin-logos.ts`, keyed by builtin name.
