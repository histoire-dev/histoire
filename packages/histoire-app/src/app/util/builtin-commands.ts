import type { ClientCommand, ClientCommandContext } from '@histoire/shared'

/** Builtin definitions are shared; each standalone/legacy adapter supplies explicit context/actions. */
export function createBuiltinCommands(getContext: () => ClientCommandContext, openEditor: (file: string) => unknown): ClientCommand[] {
  return [
    {
      id: 'builtin:open-in-editor',
      label: 'Open file in editor',
      icon: 'carbon:script-reference',
      showIf: ({ route, currentStory }) => route.name === 'story' && !!currentStory,
      getParams: () => {
        const story = getContext().currentStory
        return { file: story?.docsOnly ? story.file?.docsFilePath ?? story.file?.filePath : story?.file?.filePath }
      },
      clientAction: ({ file }) => openEditor(file),
    },
    {
      id: 'builtin:histoire-docs',
      label: 'Open Histoire Documentation',
      icon: 'carbon:help',
      clientAction: () => { window.open('https://histoire.dev/guide/getting-started.html', '_blank') },
    },
  ]
}
