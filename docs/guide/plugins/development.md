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

To add UI to the workbench or code to story frames, give the plugin a `workbench` descriptor: see [Workbench plugins](./workbench.md).

See the [plugin API reference](../../reference/plugin-api.md).

## Publish to the marketplace

Publish your package to npm with the `histoire-plugin` keyword and a declarative `histoire.marketplace` object. Export the configured factory by name from the package root. Listing metadata never imports your package code; community entries appear only when users enable community plugins. Publishing under `@histoire/` alone does not grant Official status: that also requires inclusion in Histoire's bundled index.

```json
{
  "name": "my-histoire-plugin",
  "version": "0.2.0",
  "keywords": ["histoire-plugin"],
  "peerDependencies": { "histoire": ">=1.0.0-beta.1" },
  "histoire": {
    "marketplace": {
      "displayName": "My plugin",
      "summary": "Story checks and a results pane.",
      "category": "testing",
      "monogram": "My",
      "tint": "blue",
      "frameworks": ["vue", "react", "svelte"],
      "requires": { "histoire": ">=1.0.0-beta.1" },
      "adds": [{ "kind": "rail-pane", "text": "Story check results", "contribution": "results" }],
      "access": ["story-dom"],
      "config": {
        "import": "MyHistoirePlugin",
        "options": [
          { "key": "test", "label": "Run story tests", "type": "boolean", "default": false },
          { "key": "level", "label": "Check level", "type": "enum", "choices": [{ "value": "strict", "label": "Strict" }, { "value": "normal", "label": "Normal" }], "default": "normal", "when": { "test": true } },
          { "key": "skip", "label": "Skip selectors", "type": "string-list", "default": [] }
        ]
      },
      "recommend": [{ "dependency": "vitest", "reason": "Vitest detected" }],
      "collections": ["visual-testing"],
      "releaseNotes": [{ "kind": "breaking", "text": "Renamed the report token option.", "code": ["report.token", "report.accessToken"] }],
      "migrations": [{ "from": "<0.2.0", "ops": [{ "op": "rename-option", "from": "report.token", "to": "report.accessToken" }] }]
    }
  }
}
```

Keep metadata plain JSON and public. Required fields are `displayName`, `summary`, `category`, `monogram`, `tint` and `config.import`. Invalid required fields exclude the manifest; invalid optional fields/items are dropped with diagnostics. Name limit is 40 characters, summary 160, other text 500. See the [complete manifest reference](../../reference/plugin-api.md#marketplace-manifest) for enums and validation rules.

Options support `boolean`, `enum`, `string` and `string-list`. Keys are safe dot paths in the factory's first object argument. Keep declared defaults equal to runtime defaults: generated calls omit matching values. Enum choices use string values; `display: "segmented"` selects segmented controls. `when` maps other declared option keys to required literal values. It only controls field visibility. Avoid duplicate or overlapping option paths.

Recommendations use either `{ "dependency": "vitest", "reason": "Vitest detected" }` or `{ "missing": true, "reason": "Add story checks" }`. `missing` matches projects without an installed plugin in this entry's category. These are project signals, not callbacks. `adds` advertises what your plugin contributes; live workbench registrations determine the post-install tour.

Set `adds[].contribution` to the registration's local id, such as `results`, without a plugin namespace, colon or whitespace. This matches a description to one live contribution of the declared kind. An invalid relation is dropped with a diagnostic while keeping the description. Without an exact relation, legacy first-of-kind descriptions are used only when that plugin registers a single contribution of that kind. Metadata never creates a registration or opens an unmatched pane.

Panes (`api.shell.pane`) and inspector tabs (`api.inspector.tab`) can declare `primaryCommand` using a local command id or a qualified id owned by the same plugin. The host qualifies local ids and rejects malformed or cross-plugin relations. Register the command through `api.commands.add`; the tour shows its action only while that command is available. Toolbar items continue to use `command`. Labels never infer command relationships. See [contribution fields](../../reference/plugin-api.md#contribution-fields).

Write release notes for each published version using `breaking`, `feature` or `fix`. Optional `code` strings are displayed as text. Updates collect intervening notes newest first from registry metadata when enabled, or from committed official history when offline.

Migrations support `rename-option`, `remove-option` and `set-option`. Histoire selects releases above the installed version through the target, orders them oldest first, then matches every migration's `from` against the original installed version. Operations apply in declaration order to one enabled plugin factory's first literal object argument. There is no JavaScript migration hook. Renames cannot overwrite a different destination value; computed values, ambiguous calls and unsupported structures require manual edits. Downgrades never run migrations. Test upgrade paths from every version range your metadata claims to support.

See [using the marketplace](./marketplace.md) for installation, local preferences and recovery behavior.

### Official release history

Maintainers of bundled official plugins record release metadata alongside each package in `marketplace-history.json`. After setting the package version and its marketplace requirements, frameworks, notes and migrations, run from the repository root:

```sh
pnpm marketplace:history
pnpm marketplace:index
```

Review and commit the history files and generated `packages/histoire/src/node/marketplace/catalog/official.json` with the release changes. The snapshot command reads the fixed official package allowlist and plain JSON; it never imports plugin code. It records the current exact version once. Reruns preserve an existing version's snapshot, so later manifest edits cannot silently rewrite a release. Update metadata before taking the first snapshot for that version.

Snapshots contain `version`, `requires`, `frameworks`, optional `releaseNotes`, `migrations` and `publishedAt`. Publication dates are optional and must be valid date strings when supplied; the command does not invent dates. History is validated, deduplicated and sorted with npm semver, retaining the newest 50 versions. The index command requires every current package version to have a snapshot. Diagnostics identify dropped fields; review them before committing.

Initial seeds hold only current versions. Recover older releases from their actual published metadata before adding history; do not fabricate notes, migrations or compatibility requirements. Bundled server readers evaluate each version's own requirements and frameworks without contacting a registry. History files are release inputs and excluded from published plugin package contents.

## Extending Vite configuration

Use `viteConfig` when an integration must change Vite options before Vite resolves its plugins. It receives the merged Vite config and a context containing Histoire `mode`, `isServer`, `browserRuntime`, and `collecting`. Return a partial Vite config to merge, or nothing to leave it unchanged. The hook also runs for collection and test runtimes, so restrict interactive tools to the intended environment.

```ts
export function MyPlugin(): Plugin {
  return {
    name: 'my-plugin',
    viteConfig(_config, context) {
      if (context.mode !== 'dev' || context.isServer || context.browserRuntime) return
      return { define: { __MY_FEATURE__: 'true' } }
    },
  }
}
```

## Vue framework integrations

A plugin integrating a Vue framework (like `@histoire/plugin-nuxt` or `@histoire/plugin-quasar`) usually:

1. Returns the framework's Vite config from `defaultConfig` (`vite` option), dropping plugins that only make sense for the framework's own dev server.
2. Returns `setupCode`: modules exporting a `setupVue3` function. They run before the user's setup file, for each story app.
3. Uses the setup API `hooks` to follow the story app lifecycle:

```js
// Module referenced in `setupCode`
export async function setupVue3({ app, hooks, onDarkChange }) {
  const framework = await createFramework(app)

  // Run the user setup file and `setupApp` inside the framework context
  hooks.setRunWithContext(callback => framework.runWithContext(callback))

  hooks.onBeforeMount(() => framework.callHook('beforeMount'))
  hooks.onMounted(() => framework.callHook('mounted'))
  hooks.onCleanup(() => framework.dispose())

  onDarkChange(dark => framework.setDark(dark))
}
```

See [App setup](../vue3/app-setup.md#lifecycle-hooks) for the list of hooks.

## Plugin details

Plugins may provide public metadata for the Plugins settings page. `name` remains the stable plugin identity; metadata is optional.

```ts
import type { Plugin } from 'histoire'

export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    metadata: {
      displayName: 'My plugin',
      description: 'Adds tools to the workbench',
      icon: 'puzzle',
      logoUrl: 'https://example.com/logo.svg',
      docsUrl: 'https://example.com/docs',
      repoUrl: 'https://github.com/example/my-plugin',
    },
  }
}
```

`icon` names an offline Histoire glyph. A valid HTTPS `logoUrl` takes precedence; without a logo Histoire uses the icon or the puzzle glyph. A logo that fails to load uses the puzzle glyph. Documentation and repository links accept HTTP or HTTPS URLs. Histoire fills missing description, documentation, and repository details from a matching installed package's `package.json` when available. Metadata is public in development and static builds; never put secrets in it.
