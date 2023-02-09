import { openInEditor } from '../../util/open-in-editor.js'
import { useStoryStore } from '../../stores/story.js'
import type { SearchCommand } from '../../types.js'

const storyStore = useStoryStore()

export const devCommands: SearchCommand[] = [
  {
    id: 'open-in-editor',
    label: 'Open file in editor',
    icon: 'carbon:script-reference',
    showIf: ({ route }) => route.name === 'story' && !!storyStore.currentStory,
    getParams: () => {
      const story = storyStore.currentStory
      let file: string
      if (story.docsOnly) {
        file = story.file?.docsFilePath ?? story.file?.filePath
      } else {
        file = story.file?.filePath
      }
      return {
        file,
      }
    },
    clientAction: ({ file }) => {
      openInEditor(file)
    },
  },
]

export function executeCommand (command: SearchCommand, params: Record<string, any>) {
  if (import.meta.hot) {
    import.meta.hot.send('histoire:dev-command', {
      id: command.id,
      params,
    })

    command.clientAction?.(params)
  }
}
