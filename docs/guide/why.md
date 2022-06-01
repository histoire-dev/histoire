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

<div class="htw-flex htw-justify-center htw-mt-12">
  <img src="/logo.svg" alt="Histoire logo" class="htw-max-h-[256px]">
</div>

# Why Histoire

## Overview

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="htw-btn htw-p-1 htw-leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="htw-w-4 htw-h-4 htw-align-middle"/></button>

Histoire is a tool to generate stories applications (or "books").

<a href="https://vue3.examples.histoire.dev/" target="_blank" class="htw-btn htw-flex htw-items-center htw-gap-4 htw-p-4 hover:htw-no-underline">
  <img src="/logo.svg" alt="Logo" class="htw-w-8 htw-h-8">
  Online demo
</a>

A story is a scenario where you showcase in your browser one or more components for specific use cases.

Stories are useful for several reasons:
- Organize and document components for other developers
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
- Many other features!

## Why should I use Histoire?

Histoire is built from the ground up to be a Vite-native Story builder. Our core values when designing Histoire are:

- **Native to Vite projects**: By reusing your Vite config, it takes less time setting up and more time writing stories. Same building pipeline means no duplicate effort and configuration! Out-of-the-box support of TypeScript, JSX, Styles...

- **Idiomatic**: No mandatory JSX-oriented and funky template/args syntax! Write your story naturally in either `.vue` files, `.svelte` files, JSX or whatever feel the most at home with the framework you are using in the rest of your project. We also want to have the least amount of Histoire API leaking into your story code.

- **Fast and light**: Enjoy writing stories using Vite instant server startup and instant HMR! Books built with Histoire will be fast in production as well thanks to code-splitting and lean bundle sizes.

- **Customizable**: You can very easily change the look and feel to match your branding, or install plugins to extend Histoire's features.

- **Great User Experience**: We care about UX and we strive to make the Histoire UI as beautiful and intuitive as possible. It also supports phones!

## Features

Here are some highlights of our favorite features:

### :zap: Dynamic source

The copiable source code is an important part of the documentation purpose of stories.  
For supported frameworks, Histoire can generate the template/JSX/source code that you can one-click-copy and paste in your project.

### :bento: Variant grids

Display many variants of your story on a single grid page. Finally, you can glance at all the possible buttons at once.

### :book: Markdown docs

Add documentation to your stories with (extendable) Markdown with code snippets and syntax highlighting.

### :moon: Dark theme

Rest your eyes with the alternative darker theme for your book.  
Change the story background (with an optional checkerboard) to test your design in different situations.

### :iphone: Responsive testing

Resize the preview to test your design on different screen sizes. Customize the presets to your liking!

### :musical_keyboard: Flexible controls

Put your own components and logic in the story controls pane! Or use the [builtin controls](https://controls.histoire.dev).

### :camera: Visual regression testing

Take snapshots of your stories when your book is built on your CI, with Percy support.

### :art: Automatic design tokens

Histoire will automatically detect your Tailwind CSS configuration and generate design system stories for you.

### :mag: Fast fuzzy search

A real search index is built in your book! Search for your stories or even text in your documentation without the need for an external service. Plus it's really fast!
