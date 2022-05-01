# Histoire Screenshot visual regression testing

```
pnpm add -D @histoire/plugin-screenshot
```

Add the plugin in histoire config:

```js
import { defineConfig } from 'histoire'
import { HstScreenshot } from '@histoire/plugin-screenshot'

export default defineConfig({
  plugins: [
    HstScreenshot({
      // Options here
    }),
  ],
})
```
