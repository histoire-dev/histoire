import type { Plugin } from 'histoire'
import type { Story, Variant } from '@histoire/shared'

export function HstVue (): Plugin {
  return {
    name: '@histoire/plugin-vue2',

    defaultConfig () {
      return {
        supportMatch: [
          {
            id: 'vue',
            patterns: ['**/*.vue'],
            pluginIds: ['vue2'],
          },
        ],
      }
    },

    supportPlugin: {
      id: 'vue2',
      moduleName: '@histoire/plugin-vue2',
      setupFn: 'setupVue2',
      importStoryComponent: (file, index) => `const Comp${index} = () => import(${JSON.stringify(file.moduleId)})`,
    },
  }
}

type Vue2StorySetupReturn = Record<string, any> | void

export type Vue2StorySetupHandler = (payload: {
  story?: Story
  variant?: Variant
}) => Promise<Vue2StorySetupReturn> | Vue2StorySetupReturn

export function defineSetupVue2 (handler: Vue2StorySetupHandler): Vue2StorySetupHandler {
  return handler
}
