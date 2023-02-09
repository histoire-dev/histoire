import type { PluginCommand } from 'histoire'

export default {
  id: 'histoire:plugin-vue:generate-story',
  label: 'Generate Vue 3 story from component',
  icon: 'https://vuejs.org/logo.svg',
  searchText: 'generate create',
  serverAction (params) {
    console.log('generate story', params)
  },
  clientSetupFile: '@histoire/plugin-vue/dist/commands/generate-story.client.js',
} as PluginCommand
