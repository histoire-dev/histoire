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

<div class="demo-links-box border-green-200 dark:border-green-900">
  <img src="/vue.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="vue3" />
</div>

<div class="demo-links-box border-orange-200 dark:border-orange-900">
  <img src="/svelte.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="svelte3" />
</div>

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

Titles marked <Badge type="tip" text="1.0-beta.2+" /> describe unreleased features for the next beta. Use [continuous releases](https://nightly.akryum.dev/histoire-dev/histoire) to try them before publication.

Use Node.js **22.12 or later** and [Vite](https://vitejs.dev) **7 or 8**. Framework tooling can impose a higher Node.js requirement.

---

| Framework | Version | Support* | Auto-CodeGen* | Auto-Docs* |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue →](./vue3/getting-started.md) | `3.5.26+` | ✅ | ✅ | ✅ |
| [Svelte →](./svelte3/getting-started.md) | `4 / 5` | ✅ | - | 🏗️ |
| Solid | - | - | - | - |
| Angular | - | - | - | - |
| [React →](./react/getting-started.md) | `18 / 19` | ✅ | - | - |

**<u>Support</u> means the following is available*:
- Collect and render stories
- Render controls pane content with state sync
- Builtin controls wrappers
- Static source

*<u>*Auto-CodeGen*</u>: Generates copiable source code dynamically from the current story state. Generally requires a Virtual DOM.

*<u>*Auto-Docs*</u>: Generates documentation and controls automatically by analyzing the imported components.

Nuxt **3 / 4** uses `@histoire/plugin-nuxt` alongside the Vue plugin. SvelteKit **2 / 3** uses the Svelte plugin.

### Vite 8 support <Badge type="tip" text="1.0-beta.2+" />

Vite 8 is supported alongside Vite 7. Use a framework Vite plugin compatible with your project's Vite version.

## Explore the workbench <Badge type="tip" text="1.0-beta.2+" />

<a href="/demo/" target="_self">Open the demo</a> to browse stories, select variants, edit props, read docs and inspect generated source. The demo is a static book built with this documentation. Tests, comments, canvas screenshots and MCP activity require a development server.

Start with [workbench layout](./ui-shell.md), [navigation and search](./ui-navigation.md), [the inspector](./ui-inspector.md), and [props matrix](./ui-matrix.md).

## Community

If you have questions or need help, reach out to the community at [Discord](https://discord.gg/KpCnT72rJk) and [GitHub Discussions](https://github.com/histoire-dev/histoire/discussions).
