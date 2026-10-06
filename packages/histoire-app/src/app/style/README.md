# Workbench foundations

`tokens.pcss` implements the supplied C1 light/dark palettes. Tokens live on
`.histoire-app`, `.histoire-workbench`, or `.histoire-root`; a provider's
`data-histoire-appearance="dark"` and the existing `.htw-dark` class both select
dark values. Preview documents retain their own styles.

Use `--histoire-surface`, `--histoire-canvas`, `--histoire-border`,
`--histoire-chip`, `--histoire-input`, `--histoire-text`, `--histoire-body`, and
`--histoire-muted` for neutral surfaces and text. Accent, danger, warning, agent,
measure, and code tokens follow the same `--histoire-` prefix. Each color has an
RGB-channel companion ending in `-rgb` for Tailwind opacity utilities.

Floating elements use `--histoire-shadow-toolbar`, `--histoire-shadow-popover`,
or `--histoire-shadow-panel`. Regular panels use borders. Font families are
provided through `--histoire-font-sans` and `--histoire-font-mono`; `theme.fonts`
can replace either family independently. The generated theme CSS only sets
these font variables on workbench roots.

`fonts.pcss` loads bundled variable Manrope at weights 400–800 and JetBrains
Mono at weights 400–500. Both use Latin/Latin Extended WOFF2 subsets and
`font-display: swap`. Local files under `fonts/` are copied to `dist/fonts/`
beside the generated stylesheet, so source development and published builds
resolve the same relative URLs without external font services. Full SIL Open
Font License texts and pinned upstream versions accompany the font files.

Refresh these assets after updating the Fontsource development dependencies:

```bash
node packages/histoire-app/scripts/generate-fonts.mjs
```

The default palettes match C1 exactly. Customized `theme.colors` shades map to
the existing `--_histoire-color-*` channels in `virtual/workbench-palette.ts`.
Light accent uses primary 500; dark accent uses primary 400. Fixed violet and
measure colors stay independent of project palettes.

## Icons

`@histoire/controls/vue` exports the single `BuiltinIcon` renderer. Its `icon`
prop accepts a bundled Carbon name (prefixed or bare), another Iconify
identifier, or an image URL/path. Known Carbon glyphs and compatibility aliases
render from bundled data without network access; other icon namespaces continue
through Iconify. `size` accepts pixels or a CSS length, while explicit `width`
and `height` can override either dimension.

The Vue-free canonical collection/helper lives in
`packages/histoire-shared/src/icons/`, exposed through
`@histoire/shared/dist/icons/index.js`. `BuiltinIcon` uses this shared data and
registers the collection for user stories that import Iconify directly. The
workbench utility retains compatibility exports, and legacy MDI, Fluent, and
Remix first-party names resolve to Carbon aliases. User-authored story
components keep their own icon integrations.

Add glyphs to `packages/histoire-shared/src/icons/icon-names.json`, then run
from the repository root:

```bash
node packages/histoire-app/scripts/generate-icons.mjs
```

The generator reads the development dependency `@iconify-json/carbon`; browser
code imports only the generated shared `icons/carbon-icons.json`. Carbon glyphs
retain the upstream Carbon icon license alongside the shared data.

Standalone `App.vue` supplies semantic provider roles as references to C1 RGB
channels. This overrides the SDK's generic inline primary-600 accent while
preserving dark primary-400, custom palette alpha, and portable SDK styling.

## Tests

App logic reuses `packages/histoire/vitest.config.ts`; no additional runner or
test environment is required. Foundation checks run with:

```bash
pnpm --filter histoire exec vitest run src/node/__tests__/workbench-theme.spec.ts src/node/__tests__/workbench-icons.spec.ts
```

These tests cover default/custom font variables, color channels and alpha,
semantic accent mapping, all bundled glyphs with networking unavailable, and
legacy alias resolution. Font asset packaging and browser layout are verified
through the app build and example browser validation.
