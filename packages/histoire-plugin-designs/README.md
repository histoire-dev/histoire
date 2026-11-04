# @histoire/plugin-designs

Show Figma, Penpot, Sketch, image and iframe designs next to Histoire stories, in a **Design** inspector tab and a side-by-side canvas arrangement.

```sh
pnpm add -D @histoire/plugin-designs
```

```ts
import { HstDesigns } from '@histoire/plugin-designs'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstDesigns()],
})
```

```vue
<Story :meta="{ design: { type: 'figma', url: 'https://www.figma.com/design/KEY/Button' } }">
  <!-- ... -->
</Story>
```

Documentation: https://histoire.dev/guide/plugins/designs.html
