import { markRaw } from 'vue'
import type { StoryFile, Variant } from '../types'

export function mapFile (file: StoryFile, existingFile?: StoryFile): StoryFile {
  const result: StoryFile = {
    ...file,
    component: markRaw(file.component),
    story: {
      ...file.story,
      title: file.story.title,
      file: markRaw(file),
      variants: file.story.variants.map(v => mapVariant(v)),
    },
  }

  if (existingFile) {
    for (const index in result.story.variants) {
      const variant = result.story.variants[index]
      const existingVariant = existingFile.story.variants[index]
      if (existingVariant) {
        if (existingVariant.state) Object.assign(variant.state, existingVariant.state)
        if (existingVariant.initState) variant.initState = existingVariant.initState
        if (existingVariant.slots) variant.slots = existingVariant.slots
        if (existingVariant.ready) variant.ready = existingVariant.ready
      }
    }
    if (existingFile.story.lastSelectedVariant) {
      result.story.lastSelectedVariant = result.story.variants.find(v => v.id === existingFile.story.lastSelectedVariant.id)
    }
  }

  return result
}

export function mapVariant (variant: Variant): Variant {
  return {
    ...variant,
    state: {},
    initState: null,
    slots: () => ({}),
    ready: false,
  }
}
