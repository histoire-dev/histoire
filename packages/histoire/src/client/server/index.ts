import type { StoryFile, Story } from '../../node/types'

export interface ServerRunPayload {
  file: StoryFile
  storyData: Story[]
  el: HTMLElement
}

export async function run (payload: ServerRunPayload) {
  let result: any

  // @TODO if (vue3)
  {
    const { run } = await import('./vue3/run.js')
    result = await run(payload)
  }

  return result
}
