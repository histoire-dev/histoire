import type { ClientCommandOptions } from 'histoire'
import { sendEvent } from 'histoire/plugin'

export default {
  prompts: [
    {
      field: 'component',
      label: 'Component',
      type: 'select',
      options: async (search) => sendEvent('listVueComponents', { search }),
    },
    {
      field: 'title',
      label: 'Story title',
      type: 'text',
    },
  ],
} as ClientCommandOptions
