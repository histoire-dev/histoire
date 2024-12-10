# Histoire Screenshot with Percy for visual regression testing

You need the [Percy CLI](https://docs.percy.io/docs/cli-overview) installed to be able to send snapshots to Percy.

```bash
pnpm add -D @histoire/plugin-percy
```

Add the plugin in histoire config:

```js
import { HstPercy } from '@histoire/plugin-percy'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [
    HstPercy({
      // Options here
    }),
  ],
})
```

Then use the Percy CLI

```bash
# Replace `story:build` with the script to build the stories if you changed it
percy exec pnpm run story:build
```
