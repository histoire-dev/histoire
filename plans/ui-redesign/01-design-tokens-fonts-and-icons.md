# 01 — Design tokens, fonts, and icons

## Outcome and prerequisites

Depends on: none.

The app has root-scoped design tokens for both themes, bundled Manrope and JetBrains Mono fonts, and an offline Carbon icon set. Existing views keep working and pick up the new typography and colors; no layout changes yet. Tokens and icon names come from [design-reference.md](design-reference.md).

## Owned files

- Add `app/style/tokens.pcss` (CSS custom properties on the app root for light and `.htw-dark`), `app/style/fonts/` (woff2 subsets + `@font-face`), and update `app/style/main.pcss` to drop the Google Fonts import.
- Extend `packages/histoire-app/tailwind.config.cjs` with semantic color names (`surface`, `canvas`, `border`, `chip`, `muted`, `accent`, `danger`, `warn`, `agent`) mapped to the new variables, keeping the `htw-` prefix and existing `primary-*`/`gray-*` scales.
- Add `app/util/icons.ts`: registers a Carbon subset with `addCollection` from `@iconify-json/carbon` at build time and exports the icon-name map used by components.
- Update `packages/histoire-vendors` (iconify alias) only if registering a collection needs it.
- Update `packages/histoire-shared/src/types/config.ts` (`theme.fonts`) and `packages/histoire/src/node/virtual/resolved-theme.ts` to emit font variables.
- Add the app unit-test location decision (new `packages/histoire-app/vitest.config.ts` or documented reuse of `packages/histoire/vitest.config.ts`).

## Tests first

1. Resolved theme with default config emits accent and gray variables plus font variables; custom `theme.colors.primary` changes accent in both themes.
2. `theme.fonts.sans` override replaces the bundled family in the emitted CSS.
3. Icon registry resolves every name in the design-reference table without network access (mock `fetch` to throw).
4. A static build of `examples/vue3` contains no request to `api.iconify.design` or `fonts.googleapis.com` (scan built assets).

## Implementation steps

1. Define tokens once in `tokens.pcss`; light values on the app root class, dark values under the existing `htw-dark` class. Map accent and gray tokens to the existing `--_histoire-color-*` variables so `theme.colors` keeps working.
2. Bundle font files (Latin + Latin-ext subsets, `font-display: swap`). Keep the files inside the app dist so static hosting works offline.
3. Build the Carbon subset from the design-reference list; add new names in later slices by editing the list, not by importing the whole set.
4. Replace existing `carbon:` icon usages with the registry; replace the few `mdi:`, `fluent:`, `ri:` icons with Carbon equivalents.
5. Keep `util/dark.ts` behavior (class, storage key) but isolate its document writes behind one function so the embeddable SDK can swap it later.

## Failure paths

Missing icon name renders an empty box with a dev-only console warning, never a network fetch. Font load failure falls back to `system-ui` / `ui-monospace`.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm run lint
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Both themes use the new tokens and fonts; existing pages still render.
- No runtime network request for icons or fonts in dev or static builds.
- `theme.colors` and new `theme.fonts` overrides work; no existing config option removed.

## Non-goals

New layouts, component redesign, or dark-mode storage changes.

## Handoff

Token names, icon registry API, chosen app test location, and bundle-size delta (fonts + icons) for slice 02.
