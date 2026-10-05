import type { Plugin } from 'histoire'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defaultColors } from 'histoire'
import { dirname, join } from 'pathe'
import generateStoryCommand from './commands/generate-story.server.js'
import { isolateSvelteKit } from './util/kit.js'
import { listComponentFiles } from './util/list-components.js'
import { disableStoryComponentHmr } from './util/story-hmr.js'

/**
 * Svelte entry points that must resolve to a single copy: the runtime keeps
 * module-level state (the scheduler, the current component) that breaks apart
 * as soon as two instances coexist.
 */
const SVELTE_RUNTIME_MODULES = [
  'svelte',
  'svelte/internal',
  'svelte/legacy',
  'svelte/reactivity',
  'svelte/store',
]

export function HstSvelte(): Plugin {
  return {
    name: '@histoire/plugin-svelte',

    defaultConfig(_config, _mode, context) {
      const svelteClientAliases = getSvelteClientAliases(context?.root ?? process.cwd())

      return {
        supportMatch: [
          {
            id: 'svelte',
            patterns: ['**/*.svelte'],
            pluginIds: ['svelte4'],
          },
        ],
        theme: {
          colors: {
            primary: defaultColors.orange,
          },
          logo: {
            square: '@histoire/plugin-svelte/assets/histoire-svelte.svg',
            light: '@histoire/plugin-svelte/assets/histoire-svelte-text.svg',
            dark: '@histoire/plugin-svelte/assets/histoire-svelte-text.svg',
          },
        },
        viteIgnorePlugins: [
          'vite-plugin-sveltekit-compile',
        ],
        vite: async (config) => {
          const plugins = (await Promise.all(config.plugins ?? [])).flat().filter(Boolean)
          const kit = plugins.find(plugin => typeof plugin === 'object' && 'name' in plugin && plugin.name === 'vite-plugin-sveltekit-setup') as { api?: { options?: { paths?: { base?: string } } } } | undefined
          // Kit's app compiler uses './' for relative assets. Histoire's catalog
          // and portable preview require the canonical deployment path instead.
          const base = kit && (!config.base || config.base === './' || config.base === '')
            ? `${kit.api?.options?.paths?.base ?? ''}/`
            : undefined
          return {
            ...(base ? { base } : {}),
            plugins: [
              disableStoryComponentHmr(),
              isolateSvelteKit(),
            ],
            resolve: {
              // This plugin's own client modules import `svelte` by bare
              // specifier, and it is installed next to them as well (to compile
              // their `.svelte` sources). Without deduping, those imports resolve
              // to that copy instead of the project's: the two runtimes then have
              // separate schedulers, so components the story creates are
              // initialised but their render callbacks are never flushed — their
              // `onMount` never runs and controls stay unmounted. Unlike the
              // aliases below, this works whatever the Svelte major.
              dedupe: SVELTE_RUNTIME_MODULES,
              ...(svelteClientAliases.length ? { alias: svelteClientAliases } : {}),
            },
          }
        },
      }
    },

    supportPlugin: {
      id: 'svelte4',
      moduleName: '@histoire/plugin-svelte',
      setupFn: ['setupSvelte3', 'setupSvelte4', 'setupSvelte5'],
      importStoryComponent: (file, index) => `import Comp${index} from ${JSON.stringify(file.moduleId)}`,
    },

    commands: [
      generateStoryCommand,
    ],

    async onDevEvent(api) {
      switch (api.event) {
        case 'listSvelteComponents': {
          return listComponentFiles(api.payload.search, api.getConfig().storyMatch, undefined, api.root)
        }
      }
    },
  }
}

export * from './helpers.js'

/**
 * Client entry of each Svelte runtime module, by major.
 *
 * Both layouts are listed per module and the first one that exists on disk
 * wins, so this works whichever major the project installed. The two never
 * overlap: Svelte 5 keeps its client entries at `src/*-client.js`, Svelte 4
 * under `src/runtime/`.
 */
const SVELTE_CLIENT_ENTRIES: [RegExp, string[]][] = [
  [/^svelte$/, ['src/index-client.js', 'src/runtime/index.js']],
  [/^svelte\/internal$/, ['src/internal/index.js', 'src/runtime/internal/index.js']],
  [/^svelte\/legacy$/, ['src/legacy/legacy-client.js']],
  [/^svelte\/store$/, ['src/store/index-client.js', 'src/runtime/store/index.js']],
  [/^svelte\/reactivity$/, ['src/reactivity/index-client.js']],
]

/**
 * Aliases the Svelte runtime to the project's client build.
 *
 * The preview only ever runs in the browser, but Svelte's `exports` map puts
 * the client entry behind the `browser` condition and serves the SSR one by
 * default — which the dep optimizer picks. That build has no scheduler, so
 * components mount without their `onMount` ever running (controls stay empty).
 */
function getSvelteClientAliases(root: string) {
  try {
    const require = createRequire(join(root, 'package.json'))
    const sveltePackagePath = require.resolve('svelte/package.json')
    const svelteDir = dirname(sveltePackagePath)

    return SVELTE_CLIENT_ENTRIES
      .map(([find, candidates]) => ({
        find,
        replacement: candidates.map(candidate => join(svelteDir, candidate)).find(path => existsSync(path)),
      }))
      .filter((entry): entry is { find: RegExp, replacement: string } => !!entry.replacement)
  }
  catch {
    return []
  }
}
