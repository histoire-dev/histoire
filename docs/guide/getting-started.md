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

Histoire is a tool to generate stories applications (or "books").

[Learn more about Histoire here &raquo;](./index.md)

<DemoLinks />

## Sponsors

Histoire is an Open-Source project supported by our sponsors - thank you!

<div class="flex justify-center mt-6 mb-12 gap-2">
  <SponsorButton/>
  <a
    href="./index.html#sponsors"
    class="px-4 py-2 btn inline-flex items-center gap-2 !font-normal"
  >
    See our sponsors &raquo;
  </a>
</div>

## Supported frameworks

| Framework | Versions | Support | Auto CodeGen | Auto Docs |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue](https://vuejs.org/) | 3.2+ | ✅ | ✅ | Todo |
| [Svelte](https://svelte.dev/) | - | Planned | - | - |
| [Solid](https://www.solidjs.com/) | - | Planned | - | - |
| [Angular](https://angular.io/) | - | TBD | - | - |
| [React](https://reactjs.org/) | - | TBD ([Alternative](https://www.ladle.dev)) | - | - |


## Installation

Install the `histoire` package into your project:

```shell
pnpm i -D histoire
# OR
npm i -D histoire
# OR
yarn add -D histoire
```

## Command Line Interface

Histoire provides two commands:
- `histoire dev`: starts a development server with hot-reload
- `histoire build`: builds the app for production
- `histoire preview`: starts an HTTP server that serves the built app

You can add these to your `package.json` like this:

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build",
    "story:preview": "histoire preview"
  }
}
```

And then run them with `npm run story:dev` or `npm run story:build`.

You can specify additional CLI options like `--port`. For a full list of CLI options, run `npx histoire --help` in your project.

## TypeScript

To enable the global components types in your project, create an `env.d.ts` file at the root of your project if it doesn't already exist.

```ts
/// <reference types="histoire/vue" />
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

Histoire supports Nuxt 3 with the `@histoire/plugin-nuxt` package.

```bash
pnpm add -D @histoire/plugin-nuxt
```

Add the plugin in histoire config:

```js
import { defineConfig } from 'histoire'
import { HstNuxt } from '@histoire/plugin-nuxt'

export default defineConfig({
  plugins: [
    HstNuxt(),
  ],
})
```
