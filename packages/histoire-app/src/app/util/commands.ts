import type { ClientCommand, ClientCommandContext } from '@histoire/shared'
import { router } from '../router.js'
import { useStoryStore } from '../stores/story.js'
import { createBuiltinCommands } from './builtin-commands.js'
import { openInEditor } from './open-in-editor.js'

export const builtinCommands = createBuiltinCommands(getCommandContext, openInEditor)

export function executeCommand(command: ClientCommand, params: Record<string, any>) {
  if (import.meta.hot) {
    import.meta.hot.send('histoire:dev-command', {
      id: command.id,
      params,
    })

    command.clientAction?.(params, getCommandContext())
  }
}

export function getCommandContext(): ClientCommandContext {
  const storyStore = useStoryStore()
  return {
    route: router.currentRoute.value,
    currentStory: storyStore.currentStory,
    currentVariant: storyStore.currentVariant,
  }
}
