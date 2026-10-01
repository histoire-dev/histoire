import type { Plugin } from 'histoire'

import generateStoryCommand from './commands/generate-story.server.js'
import { listComponentFiles } from './util/list-components.js'

export function HstVue(): Plugin {
  return {
    name: '@histoire/plugin-vue',

    defaultConfig() {
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

    config() {
      return {
        vite: {
          plugins: [
            {
              name: 'histoire-plugin-vue',
              enforce: 'post',
              transform(code, id) {
                // Keep bare `vitest` imports intact so Histoire core can remap
                // them during collect-time resolution after Vite normalizes ids.
                if ((this.meta as any).histoire?.isCollecting && id.endsWith('.vue')) {
                  const transformedCode = code
                    ?.replaceAll('_resolveComponent(', '_stubComponent(')

                  return `const _stubComponent = (name) => ['Story','Variant'].some(validName => name.toLowerCase() === validName.toLowerCase()) ? _resolveComponent(name) : ({ render: () => null });${transformedCode ?? ''}`
                }
              },
            },
          ],
        },
      }
    },
    supportPlugin: {
      id: 'vue3',
      moduleName: '@histoire/plugin-vue',
      setupFn: 'setupVue3',
      importStoriesPrepend: `import { defineAsyncComponent as defineAsyncComponentVue3 } from 'vue'`,
      importStoryComponent: (file, index) => `const Comp${index} = defineAsyncComponentVue3(() => import(${JSON.stringify(file.moduleId)}))`,
    },

    commands: [
      generateStoryCommand,
    ],

    async onDevEvent(api) {
      switch (api.event) {
        case 'listVueComponents': {
          return listComponentFiles(api.payload.search, api.getConfig().storyMatch)
        }
      }
    },
  }
}

export * from './helpers.js'
