# Introduction

<div class="my-12">
  <img src="/logo.svg" alt="Peeky logo" class="max-w-32 block mx-auto">
  <p class="text-center text-primary-700 font-medium">Welcome to Peeky, a test framework for the curious minds!</p>
</div>

## What is Peeky

Peeky is a test framework. Its components are:

- Test runner
- GraphQL server that exposes an API
- Front app for the UI
- Command-Line-Interface to launch those

It also includes those libraries to help you with your tests:

- [Expect](https://jestjs.io/docs/expect) for the assertions (Jest-compatible)
- [Sinon](https://sinonjs.org/) for spies and fake functions

## Main features

Why should you try Peeky?

- It's fast: using a fast build system and multiple parallel workers, your tests will be run in not time!
- It includes a **visual user interface**!?
- TypeScript is supported out-of-the box without any configuration!
- Peeky uses Vite internally and automatically integrates with any Vite project.
- The file system is automatically stubbed while your tests are being built and run. Your code can write files but instead of being written to the disk, they stay in memory.
- Peeky also provides everything else you need to run most tests for your library or application with sane defaults.

## Tech Stack

Under-the-hood it's also using those furry libraries:

- [Vite](https://vitejs.dev/) to compile JavaScript and TypeScript faster than the speed of light ⚡️
- [Happy DOM](https://github.com/capricorn86/happy-dom) for the browser-like environment
- [Chokidar](https://github.com/paulmillr/chokidar) to watch for file changes
- [Apollo](https://apollographql.com/) for GraphQL-related stuff
- [Vue](https://vuejs.org/) for the UI frontend
- [reactive-fs](https://github.com/Akryum/reactive-fs) to handle the File System

## Special thanks 💚️

- [antfu](https://github.com/antfu) helped Peeky migrate from rollup+esbuild to Vite (checkout [his test library vitest](https://vitest.dev/) and [vite-node](https://github.com/antfu/vite-node))
