# Configuring Histoire

Put Histoire options in a standalone config file or under `histoire` in your Vite config. When both are present, Histoire merges them, giving standalone values priority where they overlap. Some fields, such as plugins, combine entries.

[Configuration reference](../reference/config.md)

## Config file

### Standalone file

Create a config file in your project and export its settings as the default export. Use `defineConfig` for TypeScript checking and completion. Histoire checks the project root first, then parent directories. In each directory, it looks for these names in order:

- `histoire.config.ts`
- `histoire.config.js`
- `.histoire.ts`
- `.histoire.js`

Example:

```ts
// histoire.config.js
import { defineConfig } from 'histoire'

export default defineConfig({
  // your Histoire configuration
})
```

### Vite config file

Put Histoire settings under the `histoire` key. Add `/// <reference types="histoire" />` at the top to type-check that key.

```ts
// vite.config.js
/// <reference types="histoire" />

import { defineConfig } from 'vite'

export default defineConfig({
  histoire: {
    // your Histoire configuration
  },
})
```

## Overriding Vite configuration

Set the `vite` property in your Histoire config to override Vite options for the book.

```ts
// histoire.config.js
import { defineConfig } from 'histoire'

export default defineConfig({
  vite: {
    // Any Vite configuration
  },
})
```

```ts
// vite.config.js
/// <reference types="histoire" />

import { defineConfig } from 'vite'

export default defineConfig({
  // ...
  histoire: {
    vite: {
      // Any Vite configuration
    },
  },
})
```
::: warning

If a CommonJS dependency needs pre-bundling in development and Vite misses it, add the dependency to `vite.optimizeDeps.include`.

```ts
// histoire.config.js
import { defineConfig } from 'histoire'

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: ['lodash'],
    },
  },
})
```
:::

### Conditions in Vite config

Use `process.env.HISTOIRE` to choose values conditionally in your Vite config.

```ts
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    __IN_HISTOIRE__: Boolean(process.env.HISTOIRE),
  },
})
```

`histoire dev` binds its public address before it loads your config: set it with `--port` and `--host`. `server.port`, `server.host` and `server.https` are ignored there.

### Ignoring plugins

To skip a Vite plugin when Histoire runs, add its name to `viteIgnorePlugins`.

```ts
// histoire.config.js
import { defineConfig } from 'histoire'

export default defineConfig({
  viteIgnorePlugins: [
    'vite:html',
    'vite-plugin-some-stuff',
  ],
})
```

You can get the name of the plugins with `console.log(somePlugin().name)` or by looking at its source code ([example](https://github.com/ElMassimo/vite-plugin-full-reload/blob/bfabc4720a04b8c75d4d17f6f4876fdf822cad22/src/index.ts#L43)).

## Global JS and CSS

Set `setupFile` to load shared CSS or JavaScript in your stories.

```ts
// histoire.config.ts

import { defineConfig } from 'histoire'

export default defineConfig({
  setupFile: '/src/histoire.setup.ts'
})
```

Import shared styles or helpers in that file.

```ts
// src/histoire.setup.ts

import './histoire.css' // Import global CSS
```

Export the setup function for your framework to configure the story app.

| Framework | Setup function |
| --------- | -------------- |
| Vue 3 | `setupVue3` |
| React | `setupReact` |

### Vue setup

Export `setupVue3` from your setup file to configure the Vue story app. Use `defineSetupVue3` to type the callback parameters.

```ts
// src/histoire.setup.ts

import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createPinia } from 'pinia'

export const setupVue3 = defineSetupVue3(({ app, story, variant }) => {
  const pinia = createPinia()
  app.use(pinia) // Add Pinia store
})
```

[Vue app setup](./vue3/app-setup.md) covers setup order, lifecycle hooks, and examples.

## Theming

Set the book's title, logo, logo link, and favicon under `theme`.

```ts
// histoire.config.ts

import { defineConfig } from 'histoire'

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

Set `theme.colors.primary` and `theme.colors.gray` to brand and neutral palettes. Each palette uses numbered shades.

#### Built-in colors {#builtin-colors}

Import a palette from `defaultColors`.

```ts
// histoire.config.ts

import { defaultColors, defineConfig } from 'histoire'

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

To use a custom palette, map shade numbers to color values.

```ts
// histoire.config.ts

import { defineConfig } from 'histoire'

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
