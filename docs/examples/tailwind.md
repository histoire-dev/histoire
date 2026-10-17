# Tailwind CSS

Histoire automatically adds your project's Tailwind design tokens under **Design System**. Tailwind CSS v3 and v4 are supported. No Tailwind installation means no generated stories.

## Automatic design-system stories <Badge type="tip" text="1.0-beta.2+" />

For **v3**, Histoire finds `tailwind.config.{js,cjs,mjs,ts}` in your project or its parents and resolves it using your project's Tailwind installation. The story keeps ID `tailwind`.

For **v4**, Histoire discovers CSS entries that import `tailwindcss` or define `@theme`, including local import chains. Imported partials and `@reference` files do not create separate stories. Multiple independent entries create separate stories named `Tailwind/<relative path>`, with stable IDs derived from their relative paths. Generated directories, dependencies, and build output are excluded from discovery.

The variants include colors, spacing, typography, borders, dimensions, shadows, opacity, breakpoints, z-index, and Full Config. Existing variant IDs remain unchanged. Categories without tokens are omitted. v4 spacing includes its base variable and finite utility suggestions exposed by Tailwind; arbitrary values do not form a finite token catalog.

Use **Filter tokens** to search names and values literally. Typography variants expose **Sample text** and, where meaningful, **Font size**. Copy actions work with keyboard focus and copy names, original values, or available v4 CSS variables. Control state stays synchronized with the selected variant's canvas.

v4 styles preserve theme variables, contextual rules, and required utility declarations inside each source's scope. Application selectors and Tailwind preflight are excluded. v4 Full Config shows resolved CSS theme variables and source metadata rather than a synthesized v3 JavaScript config.

## Select sources or disable generation <Badge type="tip" text="1.0-beta.2+" />

Configure the built-in plugin through `tailwindTokens`, exported from `histoire`. A plugin with this name replaces the default instance.

```ts
import { defineConfig, tailwindTokens } from 'histoire'

export default defineConfig({
  plugins: [tailwindTokens({ cssFile: 'app/assets/css/main.css' })],
})
```

`cssFile` accepts one path or an array of paths, relative to the Histoire project root, and replaces automatic v4 discovery. For v3, use `configFile: 'tailwind.config.ts'`. These options are version-specific; a mismatch fails generation.

To disable automatic stories:

```ts
plugins: [tailwindTokens({ enabled: false })]
```

## Changes and errors <Badge type="tip" text="1.0-beta.2+" />

Initial generation finishes before story collection starts. In development, changes to CSS, configuration, imported styles, and compatibility plugins refresh the generated story. A failed source reports its path and retains its last valid output until repaired. Removing an entry removes its generated story. Production generation errors fail the build.

Histoire uses Vite resolution for CSS imports, aliases, `@config`, and `@plugin`. This includes Nuxt UI's generated `#build/ui.css` theme. Use a prepared Nuxt project so its aliases and generated theme files exist. Tailwind v4's compiler design-system API is unstable; incompatible compiler shapes produce an explicit error.

## Use Tailwind in authored stories

Automatic token stories do not add your application CSS to authored stories. Import your CSS in a setup file when components need it.

For v4:

```css
/* src/tailwind.css */
@import "tailwindcss";
```

For v3:

```css
/* src/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```ts
// src/histoire-setup.ts
import './tailwind.css'
```

```ts
// histoire.config.ts
import { defineConfig } from 'histoire'

export default defineConfig({
  setupFile: '/src/histoire-setup.ts',
})
```

See [global JS and CSS](../guide/config.md#global-js-and-css) and [setupFile](../reference/config.md#setupfile).
