import type { Plugin } from 'histoire'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defaultColors } from 'histoire'
import { dirname, join } from 'pathe'
import generateStoryCommand from './commands/generate-story.server.js'
import { listComponentFiles } from './util/list-components.js'
import { disableStoryComponentHmr } from './util/story-hmr.js'

export function HstSvelte(): Plugin {
  return {
    name: '@histoire/plugin-svelte',

    defaultConfig() {
      const svelteClientAliases = getSvelteClientAliases()

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
        vite: svelteClientAliases.length
          ? {
              plugins: [
                disableStoryComponentHmr(),
              ],
              resolve: {
                alias: svelteClientAliases,
              },
            }
          : {
              plugins: [
                disableStoryComponentHmr(),
              ],
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
          return listComponentFiles(api.payload.search, api.getConfig().storyMatch)
        }
      }
    },
  }
}

export * from './helpers.js'

function getSvelteClientAliases() {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'))
    const sveltePackagePath = require.resolve('svelte/package.json')
    const svelteDir = dirname(sveltePackagePath)

    const aliasEntries = [
      [/^svelte$/, join(svelteDir, 'src/index-client.js')],
      [/^svelte\/legacy$/, join(svelteDir, 'src/legacy/legacy-client.js')],
      [/^svelte\/store$/, join(svelteDir, 'src/store/index-client.js')],
      [/^svelte\/reactivity$/, join(svelteDir, 'src/reactivity/index-client.js')],
    ] as const

    return aliasEntries
      .filter(([, replacement]) => existsSync(replacement))
      .map(([find, replacement]) => ({
        find,
        replacement,
      }))
  }
  catch {
    return []
  }
}
