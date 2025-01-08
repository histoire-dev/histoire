import type { Plugin } from 'histoire'
import { defaultColors } from 'histoire'
import generateStoryCommand from './commands/generate-story.server.js'
import { listComponentFiles } from './util/list-components.js'

export function HstSvelte(): Plugin {
  return {
    name: '@histoire/plugin-svelte',

    defaultConfig() {
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
      }
    },

    supportPlugin: {
      id: 'svelte4',
      moduleName: '@histoire/plugin-svelte',
      setupFn: ['setupSvelte3', 'setupSvelte4'],
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
