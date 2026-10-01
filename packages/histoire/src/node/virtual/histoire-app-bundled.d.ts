declare module '@histoire/app/dist/bundled/components/story/GenericMountStory.vue.js' {
  import type { DefineComponent } from '@histoire/vendors/vue'

  const GenericMountStory: DefineComponent
  export default GenericMountStory
}

declare module '@histoire/app/dist/bundled/components/story/GenericRenderStory.vue.js' {
  import type { DefineComponent } from '@histoire/vendors/vue'

  const GenericRenderStory: DefineComponent
  export default GenericRenderStory
}

declare module '@histoire/app/dist/bundled/util/mapping.js' {
  import type { ServerStory, StoryFile } from '@histoire/shared'

  interface MappableStoryFile extends Omit<StoryFile, 'story'> {
    story: ServerStory | StoryFile['story']
  }

  /**
   * Maps a serialized story file to the reactive client-side representation
   * expected by the bundled Histoire app runtime.
   */
  export function mapFile(file: MappableStoryFile, existingFile?: StoryFile): StoryFile
}
