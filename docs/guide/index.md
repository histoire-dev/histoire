---
sidebar: false
title: 'Early access'
---

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

## What is Histoire?

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="htw-btn htw-p-1 htw-leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="htw-w-4 htw-h-4 htw-align-middle"/></button>

Histoire is a tool to generate stories applications (or "books").

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

## Early access

Histoire is currently in early access - [the repository](https://github.com/Akryum/histoire) can only be accessed by our sponsors.

<div class="htw-flex htw-justify-center htw-my-12">
  <SponsorButton/>
</div>

You support will helps us build the best stories app based on [Vite](https://vitejs.dev)!

The early access will last a few weeks until we finish polishing the documentation and when we will feel it's ready to be tested by more people.

## Supported frameworks

| Framework | Versions | Support | Auto CodeGen | Auto Docs |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue](https://vuejs.org/) | 3.2+ | ✅ | ✅ | Todo |
| [Svelte](https://svelte.dev/) | - | Planned | - | - |
| [Solid](https://www.solidjs.com/) | - | Planned | - | - |
| [Angular](https://angular.io/) | - | TBD | - | - |
| [React](https://reactjs.org/) | - | [Alternative](https://www.ladle.dev) | - | - |

