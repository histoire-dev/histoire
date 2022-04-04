<script setup>
function playAudio () {
  document.querySelector('#histoire-audio').play()
}
</script>

<audio id="histoire-audio">
  <source src="/histoire.mp3" type="audio/mpeg">
</audio>

<div class="htw-flex htw-justify-center htw-mt-12">
  <img src="/logo.svg" alt="Histoire logo" class="htw-max-h-[256px]">
</div>

# Getting started

## Overview

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="htw-btn htw-p-1 htw-leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="htw-w-4 htw-h-4 htw-align-middle"/></button>

Histoire is a tool to generate stories applications (or "books").

<a href="https://vue3.examples.histoire.dev/" target="_blank" class="htw-btn htw-flex htw-items-center htw-gap-4 htw-p-4 hover:htw-no-underline">
  <img src="/logo.svg" alt="Logo" class="htw-w-8 htw-h-8">
  Online demo
</a>

A story is a scenario where you showcase in your browser one or more components for specific use cases.

Stories are useful for several use cases:
- Organize and document components for other developpers
- Showcase different use cases covered by your components
- Develop components in isolation
- Test visual regressions by taking screenshots

It is typically used when building a company's design system or a components library.

In Histoire, Stories contains one or more Variants, which are different use cases around the same topic or around the same components. Stories in Histoire are built this way:
- Create a Story file:
  - Import components
  - Create a Variant:
    - Initialize some state (optional)
    - Mount components
    - Add controls to allow interacting with the state (optional)
  - Add more variants (optional)

It basically gives you:
- An interactive preview of the story (or even a grid of several all the variants!)
- Copiable code to reproduce the same result in your own code
- Controls to interact with the preview
- Documentation rendered from Markdown

<div class="htw-flex htw-justify-center htw-my-12">
  <SponsorButton/>
</div>

## Supported frameworks

| Framework | Versions | Support | Auto CodeGen | Auto Docs |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue](https://vuejs.org/) | 3.2+ | ✅ | ✅ | Todo |
| [Svelte](https://svelte.dev/) | - | Planned | - | - |
| [Solid](https://www.solidjs.com/) | - | Planned | - | - |
| [Angular](https://angular.io/) | - | TBD | - | - |
| [React](https://reactjs.org/) | - | [Alternative](https://www.ladle.dev) | - | - |

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
- `histoire dev`: start a server with hot-reload
- `histoire build`: build the app for production

You can add these to your `package.json` like this:

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build"
  }
}
```

And then run them with `npm run story:dev` or `npm run story:build`.

You can specify additional CLI options like `--port`. For a full list of CLI options, run `npx histoire --help` in your project.
