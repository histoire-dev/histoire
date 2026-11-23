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

Use Histoire to develop and document Svelte components in a component book. Check the [Node.js and Vite requirements](../getting-started.md#overview), then set up the Svelte plugin in your project.

[Learn what you can build with Histoire](../index.md).

<DemoLinks framework="svelte3" />

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

## Svelte 5 support <Badge type="tip" text="1.0-beta.2+" />

Svelte 5 is supported alongside Svelte 4. Both use `@histoire/plugin-svelte` and the same story format.

## SvelteKit 3 support <Badge type="tip" text="1.0-beta.2+" />

SvelteKit 2 and 3 projects use `@histoire/plugin-svelte` alongside their existing SvelteKit Vite setup. Register `HstSvelte()` as shown below.

## Installation

Install the `histoire` and `@histoire/plugin-svelte` packages into your project:

```shell
pnpm i -D histoire @histoire/plugin-svelte
# OR
npm i -D histoire @histoire/plugin-svelte
# OR
yarn add -D histoire @histoire/plugin-svelte
```

Create an `histoire.config.js` or `histoire.config.ts` file in your project root to enable the Svelte plugin:

```ts
import { HstSvelte } from '@histoire/plugin-svelte'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstSvelte(),
  ],
})
```

## Write your first story

Create `Button.story.svelte` in your project.

```svelte
<script>
  export let Hst
</script>

<Hst.Story title="Button">
  <button>Continue</button>
</Hst.Story>
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

## Configuration

See [configuring Histoire](../config.md) for shared setup, Vite overrides, and theming.

## Community

If you have questions or need help, reach out to the community at [Discord](https://discord.gg/KpCnT72rJk) and [GitHub Discussions](https://github.com/histoire-dev/histoire/discussions).
