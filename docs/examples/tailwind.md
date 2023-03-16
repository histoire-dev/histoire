# Tailwind CSS example

In this example, we will see how to add Tailwind CSS to the stories.

## CSS file

Make sure your project has a style file with the [Tailwind directives](https://tailwindcss.com/docs/functions-and-directives#tailwind).

```css
/* src/tailwind.css */

@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Setup file

Histoire allows us to execute a setup file automatically when rendering the stories. This is useful to add global CSS files. [Learn more](../guide/config.md#global-js-and-css)

```js
// src/histoire-setup.js

import './tailwind.css'
```

We need to tell Histoire to use this file in the configuration file. [Learn more](../reference/config.md#setupfile)

```js
// histoire.config.js

import { defineConfig } from 'histoire'

export default defineConfig({
  setupFile: '/src/histoire-setup.ts',
})
```

You can now use Tailwind utility classes in your stories (or import components using them)!
