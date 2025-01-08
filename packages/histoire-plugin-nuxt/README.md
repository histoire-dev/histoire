# Histoire + Nuxt 3

```bash
pnpm add -D @histoire/plugin-nuxt
```

Add the plugin in histoire config:

```js
import { HstNuxt } from '@histoire/plugin-nuxt'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstNuxt(),
  ],
})
```
