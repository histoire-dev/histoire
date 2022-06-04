<script setup>
const viteNodeInlineDepsError = `.../my-project/node_modules/.pnpm/some-library@1.0.0/lib/esm/index.js:3
export function foo() {
^^^^^^

SyntaxError: Unexpected token 'export'
    at Object.compileFunction (node:vm:352:18)
    at wrapSafe (node:internal/modules/cjs/loader:1031:15)
    ...`
</script>

# Configuration Reference

Learn more about configuring Histoire [here](../guide/config.md).

## `plugins`

Array of plugins. Learn more about them [here](../guide/plugins.md).

```ts
import { HstNuxt } from '@histoire/plugin-nuxt'

export default defineConfig({
  plugins: [
    HstNuxt(),
  ],
})
```

## `outDir`

`string` - Default: `'.histoire/dist'`

Output directory.

```ts
export default defineConfig({
  outDir: '.histoire/dist',
})
```

## `storyMatch`

`string[]` - Default: `['**/*.story.vue']`

Glob patterns for story files to include.

```ts
export default defineConfig({
  storyMatch: [
    '**/*.story.vue',
  ],
})
```

## `storyIgnored`

`string[]` - Default: `[ '**/node_modules/**', '**/dist/**' ]`

Glob patterns to ignore files while searching for story files.

```ts
export default defineConfig({
  storyIgnored: [
    '**/node_modules/**',
    '**/dist/**',
  ],
})
```

## `tree`

`Object` - Default: `{ file: 'title', order: 'asc' }`

How to generate the story tree.

Learn more: [Vue 3](../guide/vue3/hierarchy.md)

Properties:

- `file: 'title' | 'path' | ((file: TreeFile) => string[])`: How to get the path of a story.
- `order: 'asc' | ((a: string, b: string) => number)`: How to sort the stories.

```ts
export default defineConfig({
  tree: {
    file: 'title',
    order: 'asc',
  },
})
```

## `theme`

`Object`

Customize the look of the book.

[Learn more](../guide/config.md#theming)

Properties:

- `title: string`: Main page title. For example: 'Acme Inc.'
- `logo: Object`: Logo configuration.
  - `square: string`: Square logo image without text.
  - `light: string`: Full logo for light theme.
  - `dark: string`: Full logo for dark theme.
- `favicon: string`: Href to the favicon file (**not** processed by Vite). Put the file in the `public` directory.
- `colors: Object`: Customize the colors. Each color should be an object with shades as keys.
- `logoHref: string`: Add a link to the main logo

```ts
import { defaultColors } from 'histoire'

export default defineConfig({
  theme: {
    title: 'Acme Design System',
    favicon: '/my-favicon.svg',
    logo: {
      square: '/src/img/logo-square.svg',
      light: '/src/img/logo-light.svg',
      dark: '/src/img/logo-dark.svg',
    },
    colors: {
      primary: defaultColors.cyan,
    },
    logoHref: 'https://acme.com',
  },
})
```

## `setupFile`

`string`

Setup file exporting a default function executed when setting up each story preview.

Import custom CSS files from this file.

[Learn more](../guide/config.md#global-js-and-css)

```ts
export default defineConfig({
  setupFile: '/src/histoire-setup.ts',
})
```

## `responsivePresets`

`Array`

Predefined responsive sizes for story playgrounds.

Each object in the array is a preset with the following properties:

- `label: string`: Label for the preset.
- `width: number`: Width of the preset (pixels).
- `height: number`: Height of the preset (pixels).

Default values are shown in the example below:

```ts
export default defineConfig({
  responsivePresets: [
    {
      label: 'Mobile (Small)',
      width: 320,
      height: 560,
    },
    {
      label: 'Mobile (Medium)',
      width: 360,
      height: 640,
    },
    {
      label: 'Mobile (Large)',
      width: 414,
      height: 896,
    },
    {
      label: 'Tablet',
      width: 768,
      height: 1024,
    },
    {
      label: 'Laptop (Small)',
      width: 1024,
      height: null,
    },
    {
      label: 'Laptop (Large)',
      width: 1366,
      height: null,
    },
    {
      label: 'Desktop',
      width: 1920,
      height: null,
    },
    {
      label: '4K',
      width: 3840,
      height: null,
    },
  ],
})
```

## `backgroundPresets`

`Array`

Background color of the story preview.

Each object in the array is a preset with the following properties:

- `label: string`: Label for the preset.
- `color: string`: Color of the preset.

Default values are shown in the example below:

```ts
export default defineConfig({
  backgroundPresets: [
    {
      label: 'Transparent',
      color: 'transparent',
    },
    {
      label: 'White',
      color: '#fff',
    },
    {
      label: 'Light gray',
      color: '#aaa',
    },
    {
      label: 'Dark gray',
      color: '#333',
    },
    {
      label: 'Black',
      color: '#000',
    },
  ],
})
```

## `sandboxDarkClass`

`string` - Default: `'dark'`

Class added to the html root of the story preview when dark mode is enabled.

```ts
export default defineConfig({
  sandboxDarkClass: 'my-dark-class',
})
```

## `markdown`

`(md: MarkdownIt) => MarkdownIt | Promise<MarkdownIt>`

Customize the [markdown-it](https://github.com/markdown-it/markdown-it) renderer.

```ts
export default defineConfig({
  markdown: (md) => {
    md.use(SomeMarkdownItPlugin)
  },
})
```

## `vite`

`ViteConfig | ((config: ViteConfig, env: ViteConfigEnv) => void | ViteConfig | Promise<void | ViteConfig>)`

[Vite config](https://vitejs.dev/config/) override.

```ts
export default defineConfig({
  vite: {
    server: {
      port: 3042,
    },
  },
})
```

## `viteNodeTransformMode`

`{ web?, ssr? }`

Determine the transform method of modules

### `viteNodeTransformMode.ssr`

`RegExp[]` - Default: `[/\.([cm]?[jt]sx?|json)$/]`

Use SSR transform pipeline for the specified files.<br>
Vite plugins will receive `ssr: true` flag when processing those files.

### `viteNodeTransformMode.web`

`RegExp[]` - Default: *modules other than those specified in `transformMode.ssr`*

First do a normal transform pipeline (targeting browser), then do a SSR rewrite to run the code in Node.<br>
Vite plugins will receive `ssr: false` flag when processing those files.

When you use JSX as component models other than React (e.g. Vue JSX or SolidJS), you might want to config as following to make `.tsx` / `.jsx` transformed as client-side components:

```ts
export default defineConfig({
  viteNodeTransformMode: {
    web: [/\.[jt]sx$/],
  },
})
```

## `viteNodeInlineDeps`

`RegExp[]`

Transpile dependencies when collecting stories on Node.js.

For example, if you have a dependency that contains ESM code but Node tries to load it in CommonJS context, you might have this kind of error:

<div class="overflow-auto bg-gray-100 rounded dark:bg-gray-850 text-sm">
  <pre class="text-red-500 p-4 w-fit m-0">{{ viteNodeInlineDepsError }}</pre>
</div>

We can see that the `some-library` (made-up name) is misconfigured and Node treats it as CommonJS code (the `cjs/loader` is being used) but it contains ESM code. Hence the error.

```ts
export default defineConfig({
  viteNodeInlineDeps: [
    /some-library/,
  ],
})
```
