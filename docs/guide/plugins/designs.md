# Designs plugin

`@histoire/plugin-designs` shows the design a story was built from next to the rendered variant: Figma, Penpot and Sketch embeds, any embeddable page, images and plain links. Works with Vue, Svelte, React and vanilla stories in development and static books.

```sh
pnpm add -D @histoire/plugin-designs
```

```ts
import { HstDesigns } from '@histoire/plugin-designs'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstVue(), HstDesigns()],
})
```

## Declaring designs

Add a `design` entry, or a list of entries, to the story or variant `meta`:

```vue
<template>
  <Story :meta="{ design: { type: 'figma', url: 'https://www.figma.com/design/KEY/Button?node-id=1-2' } }">
    <Variant title="Primary" />
    <Variant
      title="Dark"
      :meta="{
        design: [
          { type: 'image', name: 'Spec', url: '/designs/button-dark.png' },
          { type: 'link', url: 'https://penpot.app/...', label: 'Penpot file' },
        ],
      }"
    />
  </Story>
</template>
```

A variant `design` replaces the story's; variants without one show the story `design`.

`meta` is published in the story catalog, so it ends up in static books: never put secrets in it. Large or deeply nested metadata is left out of the catalog with a warning; keep each story or variant `meta` under 64 KiB.

## Inspector

Select a variant and open **Design**. The tab only shows for variants with designs. Several designs get a switch; the selected one is remembered per variant. **Open in new tab** opens the original link.

Images open fitted to the tab, or at `scale`, then shifted by `offset`. Scroll to zoom around the cursor, drag to pan, or use the zoom buttons, **Fit** and **100%**. With the image focused, arrow keys pan (hold Shift for bigger steps), `+` and `-` zoom, and `0` fits.

## Canvas arrangement

The **Design** canvas arrangement compares the selected variant with its design, following canvas pan and zoom. **Fit** frames both. Images show whole there; `scale` and `offset` only apply to the inspector. Disable it with `canvasView: false`.

Pick a comparison in the floating bar at the bottom of the arrangement:

- **Side by side**: the design sits next to the variant.
- **Overlay**: the design lies over the variant; the bar's slider sets its opacity.
- **Split**: the design lies over the variant, shown right of a divider; drag the divider to compare both halves.

In **Overlay** and **Split**, the story stays interactive under the design. Drag the top-left grip to move the design and the bottom-right grip to resize it (proportions stay unless Shift is held). Embedded documents keep their own layout and scale with the box. Focused grips and the divider also follow arrow keys (Shift for bigger steps). The design starts on the variant frame, scaled down to its width; the reset button in the bar restores that. The comparison and opacity are remembered, and placements per variant design.

## Design types

All entries take `url` and an optional `name` (switch label, defaults to the tool or host name; `link` entries default to their `label` first). Only `http(s)` links are accepted.

| `type` | Shows | Extra options |
| --- | --- | --- |
| `figma` | Figma design, prototype, board or slides link (or an `embed.figma.com` link), embedded with Figma Embed Kit; other Figma links are reported as invalid | `allowFullscreen` |
| `penpot` | Penpot view or share link (self-hosted instances too) | `allowFullscreen` |
| `sketch` | Sketch share link (`sketch.com/s/...`) | `allowFullscreen` |
| `iframe` | Any page that allows embedding | `allowFullscreen` |
| `image` | Image; `url` may be a path relative to the book (`/designs/a.png` from `public/`) | `scale` (initial zoom, > 0; defaults to fitting), `offset` (`[x, y]` pixels from the initial position, with or without `scale`), `alt` |
| `link` | Link only, for tools that refuse embedding | `label` (defaults to `name`, then the host name) |

Embedded pages run in a sandboxed iframe. Pages served from the book's own origin are embedded without same-origin access, so they cannot reach the workbench. Private Figma, Penpot or Sketch files need the viewer to be signed in to that tool in the same browser.

Browsers block plain `http` embeds on books served over `https` (mixed content): use `https` links.

## Options

```ts
HstDesigns({
  enabled: true,
  devOnly: false,
  embedHost: 'histoire',
  canvasView: true,
})
```

- `enabled`: defaults to `true`; false removes the tab and arrangement.
- `devOnly`: defaults to `false`; true omits the plugin from static books.
- `embedHost`: defaults to `histoire`; site name Figma receives as `embed-host`.
- `canvasView`: defaults to `true`; false removes the **Design** canvas arrangement.

## Types

To type `meta.design` in stories, reference the plugin types from a `.d.ts` file included by the stories' `tsconfig.json`, for example `src/env.d.ts`:

```ts
/// <reference types="@histoire/plugin-designs" />
```

`DesignInput` types design lists declared outside the template:

```ts
import type { DesignInput } from '@histoire/plugin-designs'

const designs: DesignInput[] = [{ type: 'image', url: '/designs/button.png', scale: 2 }]
```
