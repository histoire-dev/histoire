import type { Plugin } from 'histoire'
import type { Story, Variant } from '@histoire/shared'
import type { App } from 'vue'

export function HstVue (): Plugin {
  return {
    name: '@histoire/plugin-vue',

    defaultConfig () {
      return {
        supportMatch: [
          {
            id: 'vue',
            patterns: ['**/*.vue'],
            pluginIds: ['vue3'],
          },
        ],
      }
    },

    supportPlugin: {
      id: 'vue3',
      moduleName: '@histoire/plugin-vue',
      setupFn: 'setupVue3',
      importStoriesPrepend: `import { defineAsyncComponent as defineAsyncComponentVue3 } from 'vue'`,
      importStoryComponent: (file, index) => `const Comp${index} = defineAsyncComponentVue3(() => import(${JSON.stringify(file.moduleId)}))`,
    },
  }
}

export type Vue3StorySetupHandler = (payload: {
  app: App
  story?: Story
  variant?: Variant
}) => Promise<void> | void

export function defineSetupVue3 (handler: Vue3StorySetupHandler): Vue3StorySetupHandler {
  return handler
}
