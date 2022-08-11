import { defaultColors } from 'histoire'
import type { Plugin } from 'histoire'
import type { Story, Variant } from '@histoire/shared'

export function HstSvelte (): Plugin {
  return {
    name: '@histoire/plugin-svelte',

    defaultConfig () {
      return {
        supportMatch: [
          {
            id: 'svelte',
            patterns: ['**/*.svelte'],
            pluginIds: ['svelte3'],
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
      }
    },

    supportPlugin: {
      id: 'svelte3',
      moduleName: '@histoire/plugin-svelte',
      setupFn: 'setupSvelte3',
      importStoryComponent: (file, index) => `import Comp${index} from ${JSON.stringify(file.path)}`,
    },
  }
}

export type SvelteStorySetupHandler = (payload: {
  app: any
  story?: Story
  variant?: Variant
}) => Promise<void> | void

export function defineSetupSvelte (handler: SvelteStorySetupHandler): SvelteStorySetupHandler {
  return handler
}
