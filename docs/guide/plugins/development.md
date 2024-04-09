# Plugin development

::: warning
This doc and the Plugin API are work-in-progress. Expect changes.
:::

Create a new npm package. Example `package.json`:

```json
{
  "name": "my-histoire-plugin",
  "version": "0.1.0",
  "description": "Histoire plugin",
  "license": "MIT",
  "author": {
    "name": "Guillaume Chau"
  },
  "repository": {
    "url": "https://github.com/Akryum/my-histoire-plugin.git",
    "type": "git",
    "directory": "packages/my-histoire-plugin"
  },
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./*": "./*"
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "rimraf dist && tsc -d",
    "watch": "tsc -d -w --sourceMap"
  },
  "dependencies": {
    "defu": "^6.0.0"
  },
  "devDependencies": {
    "histoire": "latest",
    "rimraf": "^3.0.0",
    "typescript": "^5.4.4"
  },
  "peerDependencies": {
    "histoire": "latest"
  }
}
```

Don't forget to put `histoire` in your `peerDependencies`. We also put it in the `devDependencies` to install it and be able to import things from it.

Example `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "removeComments": false,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "lib": [
      "ESNext",
      "DOM"
    ],
    "sourceMap": false,
    "preserveWatchOutput": true,
    // Strict
    "noImplicitAny": false,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "strictBindCallApply": true,
    "strictFunctionTypes": true
  },
  "include": [
    "src"
  ],
  "exclude": [
    "node_modules",
    "dist/**/*",
    "src/**/*.spec.ts"
  ]
}
```

Create a new `src/index.ts` file:

```ts
import type { Plugin } from 'histoire'
import { defu } from 'defu'

export interface MyPluginOptions {
  // Options here
}

const defaultOptions: MyPluginOptions = {
  // Default values here
}

export function MyHistoirePlugin(options: MyPluginOptions = {}): Plugin {
  const finalOptions: MyPluginOptions = defu(options, defaultOptions)
  return {
    name: 'my-histoire-plugin',

    // Use the Histoire Plugin API here!
  }
}
```

Usage of your plugin:

```js
// In your histoire config

import { defineConfig } from 'histoire'
import { MyHistoirePlugin } from 'my-histoire-plugin'

export default defineConfig({
  plugins: [
    MyHistoirePlugin({
      // Options here
    }),
  ],
})
```

See the [plugin API reference](../../reference/plugin-api.md).
