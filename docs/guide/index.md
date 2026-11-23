---
sidebarDepth: 2
---

<script setup>
function playAudio () {
  document.querySelector('#histoire-audio').play()
}
</script>

<audio id="histoire-audio">
  <source src="/histoire.mp3" type="audio/mpeg">
</audio>

<div class="flex justify-center mt-12">
  <img src="/logo.svg" alt="Histoire logo" class="max-h-[256px]">
</div>

# Why Histoire

## Overview

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="btn p-1 leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="w-4 h-4 align-middle"/></button>

Histoire builds a component book from stories in your Vite project. Browse the book to see how components look and behave in different states.

<div class="demo-links-box border-green-200 dark:border-green-900">
  <img src="/vue.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="vue3" />
</div>

<div class="demo-links-box border-orange-200 dark:border-orange-900">
  <img src="/svelte.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="svelte3" />
</div>

A story renders one or more components in isolation. Each variant shows a specific use case or state. A button story might have default, disabled, and loading variants.

Write a story in your framework, import the components, and render them in each variant. Add controls to change props or state and Markdown to explain when to use each variant. The book gives your team one place to develop, document, and test components.

Follow the [getting started guide](./getting-started.md) to create your first story.

## Why should I use Histoire?

Histoire reuses your Vite configuration, including the plugins that handle TypeScript, JSX, and styles. Write stories in the same Vue, Svelte, or React syntax you use in your project, and see edits through Vite's hot updates.

Build a code-split book to share with your team. Configure its theme to match your project, or install plugins to add workbench features.

## Features

### :zap: Dynamic source

In Vue stories, copy generated source that reflects the selected variant's current state. You can also supply source text yourself.

### :bento: Variant grids

Compare variants of the same story side by side in a grid.

### :book: Markdown docs

Add Markdown documentation with syntax-highlighted code examples.

### :moon: Dark theme

Switch the book between light and dark appearance. Change the canvas background or use a checkerboard to check transparency.

### :iphone: Responsive testing

Resize the selected variant or use viewport presets to check how components behave at different screen sizes.

### :musical_keyboard: Flexible controls

Use the [built-in controls](https://controls.histoire.dev) or write custom controls to change a variant's state.

### :camera: Visual regression testing

Capture variants and compare them with approved baselines using [visual testing](./visual-testing.md). You can also run screenshot checks with [Percy](/examples/visual-regression-testing/percy) or [Lost Pixel](/examples/visual-regression-testing/lost-pixel).

### :art: Automatic design tokens

Histoire discovers [Tailwind CSS v3 configurations and v4 theme stylesheets](/examples/tailwind) and generates stories for their design tokens.

### :mag: Fast fuzzy search

Search story titles and documentation using the book's built-in index.

## Meet the team

<MeetTeam class="mb-24" />

## Sponsors

<p align="center">
  <a href="https://guillaume-chau.info/sponsors/" target="_blank">
    <img src='https://akryum.netlify.app/sponsors.svg'/>
  </a>
</p>

<div class="flex justify-center mb-12">
  <SponsorButton/>
</div>

<div class="text-center my-4">
  <a href="https://www.netlify.com">
    <img src="https://www.netlify.com/img/global/badges/netlify-color-accent.svg" alt="Deploys by Netlify" />
  </a>
</div>
