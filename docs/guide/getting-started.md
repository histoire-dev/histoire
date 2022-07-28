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


## Guides

[Vue 3](./vue3/getting-started.md)
