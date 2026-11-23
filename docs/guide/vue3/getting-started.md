<script setup>
function playAudio () {
  document.querySelector('#histoire-audio').play()
}
</script>

<audio id="histoire-audio">
  <source src="/histoire.mp3" type="audio/mpeg">
</audio>

# Getting started with Histoire

## Overview

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="btn p-1 leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="w-4 h-4 align-middle"/></button>

Use Histoire to develop and document Vue components in a component book. Check the [Node.js and Vite requirements](../getting-started.md#overview), then set up the Vue plugin in your project.

[Learn what you can build with Histoire](../index.md).

<DemoLinks framework="vue3" />

## Sponsors

Our sponsors support Histoire's open-source development.

<div class="flex justify-center mt-6 mb-12 gap-2">
  <SponsorButton/>
  <a
    href="../index.html#sponsors"
    class="px-4 py-2 btn inline-flex items-center gap-2 !font-normal"
  >
    See our sponsors &raquo;
  </a>
</div>

## Installation

Install the `histoire` and `@histoire/plugin-vue` packages into your project:

```shell
pnpm i -D histoire @histoire/plugin-vue
# OR
npm i -D histoire @histoire/plugin-vue
# OR
yarn add -D histoire @histoire/plugin-vue
```

Create an `histoire.config.js` or `histoire.config.ts` file in your project root to enable the Vue plugin:

```ts
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstVue(),
  ],
})
```

## Write your first story

Create `Button.story.vue` in your project.

```vue
<template>
  <Story title="Button">
    <button>Continue</button>
  </Story>
</template>
```

## Command Line Interface

Add these scripts to `package.json`.

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build",
    "story:preview": "histoire preview"
  }
}
```

Run `pnpm story:dev` (or `npm run story:dev`) and open the printed address. Select **Button** in Stories. Changes to the story appear as you edit.

Use `story:build` to build a static book and `story:preview` to serve it locally. Run `npx histoire --help` for CLI options such as `--port`.

## TypeScript

To enable the global components types in your project, create an `env.d.ts` file at the root of your project if it doesn't already exist.

```ts
/// <reference types="@histoire/plugin-vue/components" />
```

And add it in the `include` field of your `tsconfig.json`.

Example:

```json
{
  "compilerOptions": {
    "target": "es2017",
    "module": "esnext",
    "lib": ["esnext"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "strictNullChecks": true,
    "resolveJsonModule": true,
    "jsx": "preserve"
  },
  "include": [
    "env.d.ts",
    "src/**/*",
    "src/**/*.vue"
  ]
}
```

## Nuxt

<DemoLinks framework="nuxt3" />

Histoire supports Nuxt 3 and 4 with the `@histoire/plugin-nuxt` package.

```bash
pnpm add -D @histoire/plugin-nuxt
```

Add the plugin in histoire config:

```js
import { HstNuxt } from '@histoire/plugin-nuxt'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstVue(),
    HstNuxt(),
  ],
})
```

Ignore `.histoire` in git. Histoire generates its Nuxt build files in `.histoire/nuxt`, so it can run next to `nuxt dev` without sharing `.nuxt`. Change it with `HstNuxt({ buildDir: '.my-dir' })` (relative to the Nuxt root).

Each story app boots your Nuxt app: plugins, modules, `css`, runtime config and auto-imports. There is no Nitro server, so server routes don't answer. The plugin also:

- wraps stories in Nuxt UI's `UApp` when `@nuxt/ui` is installed, so tooltips, toasts and overlays work. Turn it off with `HstNuxt({ uiApp: false })` to add your own [wrapper](./wrapper.md),
- makes `@nuxtjs/color-mode` follow Histoire's dark mode: `useColorMode()` and the `<html>` classes use your color-mode options (`classSuffix`, `dataValue`...),
- serves the dev server handlers of Nuxt modules, such as `@nuxt/fonts`,
- gives story collection (Node) an in-memory IndexedDB and a `WebSocket` that never connects, so plugins that open them at startup don't fail.

### Skip app plugins

App plugins that only do app-wide background work (sync, analytics, PWA...) slow every story down. Skip them with `excludePlugins`. A string matches a part of the plugin file path, a `RegExp` is tested against it:

```js
HstNuxt({
  excludePlugins: [
    '/app/plugins/analytics.client.ts',
    /@nuxt\/content\/.*websocket/,
  ],
})
```

For module options, `process.env.HISTOIRE` is set while Histoire runs, e.g. to turn off a realtime connection in `nuxt.config`:

```js
export default defineNuxtConfig({
  myRealtimeModule: {
    enabled: !process.env.HISTOIRE,
  },
})
```

### Mock the network

`histoire/network` answers `fetch` requests (and so `$fetch` and `useFetch`) with [msw](https://mswjs.io) request handlers, without a service worker. Install `msw`, then set handlers for every story at the top level of your [setup file](./app-setup.md#global-setup), so they also answer requests made by Nuxt plugins while the app boots:

```ts
// histoire.setup.ts
import { mockNetworkDefaults } from 'histoire/network'
import { http, HttpResponse } from 'msw'

mockNetworkDefaults(
  http.get('/api/_auth/session', () => HttpResponse.json({ user: { id: 1 } })),
)
```

Override them per variant with `mockNetwork()` in `setup-app`. Each call replaces the handlers of the previous one:

```vue
<script setup lang="ts">
import { mockNetwork } from 'histoire/network'
import { http, HttpResponse } from 'msw'

function empty() {
  mockNetwork(http.get('/api/items', () => HttpResponse.json([])))
}
</script>

<template>
  <Story>
    <Variant title="Empty" :setup-app="empty">
      <ItemList />
    </Variant>
  </Story>
</template>
```

Requests no handler answers go to the network. Mocked requests show up in the Events panel. `XMLHttpRequest` isn't intercepted.

### Types and lint

`Story`, `Variant` and the `Hst*` controls are global components. Add their types to your project, e.g. in a `histoire.d.ts` file:

```ts
/// <reference types="@histoire/plugin-vue/components" />
```

With `vue/no-undef-components` (projects that turn off component auto-imports), allow them in story files. This block replaces the rule options, so repeat your own `ignorePatterns`:

```js
// eslint.config.js
export default [
  {
    files: ['**/*.story.vue'],
    rules: {
      'vue/no-undef-components': ['error', {
        ignorePatterns: ['^Story$', '^Variant$', '^Hst'],
      }],
    },
  },
]
```

## Quasar CLI <Badge type="tip" text="1.0-beta.2+" />

Quasar CLI projects (`@quasar/app-vite`) don't have a `vite.config` file. The `@histoire/plugin-quasar` package reads your `quasar.config` file instead.

```bash
pnpm add -D @histoire/plugin-quasar
```

```js
import { HstQuasar } from '@histoire/plugin-quasar'
import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  storyMatch: ['src/**/*.story.vue'],
  plugins: [
    HstVue(),
    HstQuasar(),
  ],
})
```

The plugin:

- reuses the Vite config Quasar CLI generates (aliases, `build.env`, `build.vitePlugins`, Sass variables, `extendViteConf`...),
- loads Quasar CSS, `extras`, `animations` and `css` entries,
- installs Quasar with your `framework` options (config, plugins, lang, icon set),
- installs your store from `src/stores/index`,
- runs client boot files in order. They receive a router using memory history, so they never change the URL of the story,
- syncs Quasar's `Dark` plugin with Histoire's dark mode.

App Extensions apply too: their boot files, CSS and `framework` options are loaded like the project's own.

While Histoire loads it, `quasar.config` sees your project folder as the working directory (`process.cwd()`, `path.resolve`), even if Histoire was started from another folder. Relative `fs` paths aren't covered: build them from `__dirname` or `ctx.appPaths`.

::: tip
The plugin reads the config through Quasar CLI's own loader. If your `@quasar/app-vite` version doesn't expose it, Histoire warns and evaluates `quasar.config` directly, without App Extension additions. Add those in your [setup file](./app-setup.md#global-setup) if your stories need them.
:::

For other UI libraries, see [Ecosystem](./ecosystem.md).

## Configuration

See [configuring Histoire](../config.md) for shared setup, Vite overrides, and theming.

## Community

If you have questions or need help, reach out to the community at [Discord](https://discord.gg/KpCnT72rJk) and [GitHub Discussions](https://github.com/histoire-dev/histoire/discussions).
