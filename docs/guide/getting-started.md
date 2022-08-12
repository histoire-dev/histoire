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

[Vite](https://vitejs.dev) currently supported versions:
- `2.9+`
- `3.0+`

---

| Framework | Version | Support* | Auto-CodeGen* | Auto-Docs* |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue →](./vue3/getting-started.md) | `3.2+` | ✅ | ✅ | 🏗️ |
| [Vue →](./vue2/getting-started.md) | `2.7+` | ✅ | ✅ | - |
| [Svelte →](./svelte3/getting-started.md) | `3+` | ✅ | - | - |
| Solid | - | - | - | - |
| Angular | - | - | - | - |
| React | - | - ([Alternative](https://www.ladle.dev)) | - | - |

**<u>Support</u> means*:
- Collect and render stories
- Render controls pane content with state sync
- Builtin controls wrappers
- *Static source (soon)*

*<u>*Auto-CodeGen*</u>: Generates copiable source code dynamically from the current story state.

*<u>*Auto-Docs*</u>: Generates documentation and controls automatically by analyzing the imported components.
