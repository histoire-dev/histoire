# Histoire Screenshot visual regression testing

```
pnpm add -D @histoire/plugin-screenshot
```

Add the plugin in histoire config:

```js
import { HstScreenshot } from '@histoire/plugin-screenshot'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstScreenshot({
      // Options here
    }),
  ],
})
```

## Setting Up Chrome Linux Sandbox

If you get an error like No usable sandbox! or Running as root without --no-sandbox is not supported, you need to properly set up sandboxing on your Linux instance.
Alternatively, if you completely trust the content, you can disable sandboxing (strongly discouraged):

ref. https://github.com/sindresorhus/capture-website#faq

```
import { defineConfig } from 'histoire'
import { HstScreenshot } from '@histoire/plugin-screenshot'

export default defineConfig({
  plugins: [
    HstScreenshot({
      launchOptionsArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    }),
  ],
})
```
