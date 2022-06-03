# Histoire + Nuxt 3

```bash
pnpm add -D @histoire/plugin-nuxt
```

Add the plugin in histoire config:

```js
import { defineConfig } from 'histoire'
import { HstNuxt } from '@histoire/plugin-nuxt'

export default defineConfig({
  plugins: [
    HstNuxt(),
  ],
})
```
