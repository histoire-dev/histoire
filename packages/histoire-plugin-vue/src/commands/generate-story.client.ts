import type { ClientCommandOptions } from 'histoire'
import { sendEvent } from 'histoire/plugin'

export default {
  prompts: [
    {
      field: 'component',
      label: 'Choose a component',
      type: 'select',
      options: async (search) => sendEvent('listVueComponents', { search }),
      required: true,
    },
    {
      field: 'fileName',
      label: 'File name',
      type: 'text',
      required: true,
      defaultValue: (answers) => answers.component?.replace(/.+\/(.+?)\.vue$/, '$1.story.vue'),
    },
  ],
} as ClientCommandOptions
