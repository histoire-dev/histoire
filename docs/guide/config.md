# Configuration

To customize your experience, you can configure several parts of Histoire.

## Standalone file

The first option is to create a new file at the root of your project called `histoire.config.{js,ts}`. The configuration file must export the configuration as default. Histoire provide a helper function `defineConfig` to enforce TypeScript typing.

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
    // your Histoire configuration
})
```

## Vite config file

The second option is to provide the Histoire config object directly in your Vite config file `vite.config.{js,ts}`. To have the correct TypeScript check, make sure to use this [triple slash directive](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html) at the very top of your config file:

```ts
/// <reference types="histoire" />
```

Here's what your vite config file should look like:

```ts
/// <reference types="histoire" />

import { defineConfig } from 'vite'

export default defineConfig({
    histoire: {
        // your Histoire configuration
    },
})
```

## Global JS and CSS

Your components may be using globally defined CSS (like CSS frameworks) or JS (like stores or helpers). Histoire provide an easy way to inject anything into each story by linking a setup file.

```ts
// histoire.config.ts

export default defineConfig({ 
    setupFile: '/src/histoire.setup.ts'
})
```

Histoire provide a function `defineVue3StorySetup` to access the current app, story and variant for your convenience. You can use it inside your setup file like this:

```ts
// src/histoire.setup.ts

import './histoire.css' // Import global CSS

import { createPinia } from "pinia";
import { defineVue3StorySetup } from 'histoire/client'

export default defineVue3StorySetup(({ app }) => {
    const pinia = createPinia();
    app.use(pinia); // Add Pinia store
})
```
