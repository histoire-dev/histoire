import type { Plugin } from 'histoire'

export function HstVue (): Plugin {
  return {
    name: '@histoire/plugin-vue',

    config () {
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
      importStoryComponent: (file, index) => `const Comp${index} = defineAsyncComponentVue3(() => import('${file.path}'))`,
    },
  }
}
