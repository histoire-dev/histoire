# Configuring Histoire

To customize your experience, you can configure several parts of Histoire.

[See the full configuration reference →](../reference/config.md)

## Config file

### Standalone file

The first option is to create a new file at the root of your project called `histoire.config.{js,ts}` or `.histoire.{js,ts}`. The configuration file must export the configuration object as default. Histoire provides a helper function `defineConfig` to enforce TypeScript typing.

Detected files:

- `histoire.config.ts`
- `histoire.config.js`
- `.histoire.ts`
- `.histoire.js`

Example:

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  // your Histoire configuration
})
```

### Vite config file

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

Your components may be using globally defined CSS (like CSS frameworks) or JS (like stores or helpers). Histoire provides an easy way to inject anything into each story by linking a setup file.

```ts
// histoire.config.ts

export default defineConfig({ 
  setupFile: '/src/histoire.setup.ts'
})
```

In this file, you can import global CSS files or JS files.

```ts
// src/histoire.setup.ts

import './histoire.css' // Import global CSS
```

You can also tell Histoire to configure the sandbox application using the corresponding setup function (more details afterwards).

| Framework | Setup function |
| --------- | -------------- |
| Vue 3 | `setupVue3` |

### Vue 3 setup

Inside your setup file, you can export a `setupVue3` function that will be called by Histoire allowing you to configure the Vue 3 sandbox application. Histoire provides an optional `defineSetupVue3` helper to have better types in your IDE :

```ts
// src/histoire.setup.ts

import { createPinia } from 'pinia'
import { defineSetupVue3 } from '@histoire/plugin-vue'

export const setupVue3 = defineSetupVue3(({ app, story, variant }) => {
  const pinia = createPinia()
  app.use(pinia) // Add Pinia store
})
```

[Learn more](./vue3/app-setup.md)

## Theming

Histoire can be white-labeled to match your brand guidelines. Here are the available options:

```ts
// histoire.config.ts

export default defineConfig({ 
  theme: {
    title: 'Acme Inc.',
    logo: {
      square: './img/square.png',
      light: './img/light.png',
      dark: './img/dark.png'
    },
    logoHref: 'https://acme.com',
    favicon: './favicon.ico',
  }
})
```

### Colors


To better match your colors guidelines, you can customize every colors used in the app. Note that Histoire uses Tailwind for its UI, so the colors pattern must match the Tailwind pattern.

#### Builtin colors

Histoire provides some builtin patterns to easily change the color of the app.

```ts
// histoire.config.ts

import { defaultColors } from 'histoire'

export default defineConfig({ 
  theme: {
    colors: {
      gray: defaultColors.zinc,
      primary: defaultColors.cyan
    }
  }
})
```

Available colors patterns:
- `slate`
- `gray`
- `zinc`
- `neutral`
- `stone`
- `red`
- `orange`
- `amber`
- `yellow`
- `lime`
- `green`
- `emerald`
- `teal`
- `cyan`
- `sky`
- `blue`
- `indigo`
- `violet`
- `purple`
- `fuchsia`
- `pink`
- `rose`

#### Custom colors

You can also define your own colors.

```ts
// histoire.config.ts

export default defineConfig({ 
  theme: {
    colors: {
      gray: {
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#3f3f46',
        750: '#323238',
        800: '#27272a',
        850: '#1f1f21',
        900: '#18181b',
        950: '#101012',
      },
      primary: {
        50: '#ecfeff',
        100: '#cffafe',
        200: '#a5f3fc',
        300: '#67e8f9',
        400: '#22d3ee',
        500: '#06b6d4',
        600: '#0891b2',
        700: '#0e7490',
        800: '#155e75',
        900: '#164e63',
      }
    }
  }
})
```

