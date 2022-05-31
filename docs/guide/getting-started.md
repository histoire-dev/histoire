# Getting started with Histoire

Histoire is an Open-Source project supported by our sponsors - thank you!

<div class="htw-flex htw-justify-center htw-mt-6 htw-mb-12">
  <SponsorButton/>
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
/// <reference types="histoire" />
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
