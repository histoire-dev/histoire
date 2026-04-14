import type { ServerStory, ServerVariant, StoryFile, Variant } from '@histoire/shared'
import { markRaw, reactive } from '@histoire/vendors/vue'

const copiedFromExistingVariant = [
  'state',
  'slots',
  'source',
  'responsiveDisabled',
  'autoPropsDisabled',
  'setupApp',
  'configReady',
  'previewReady',
]

interface MappableStoryFile extends Omit<StoryFile, 'story'> {
  story: ServerStory | StoryFile['story']
}

type MappableVariant = ServerVariant | Variant

function createEmptySlots() {
  return {
    default: null,
    controls: null,
    source: null,
  }
}

/**
 * Maps a serialized story file into the reactive preview shape expected by the
 * Histoire story runtime.
 */
export function mapStoryFile(file: MappableStoryFile, existingFile?: StoryFile): StoryFile {
  let result: StoryFile

  if (existingFile) {
    result = existingFile
    for (const key in file) {
      if (key === 'story') {
        result.story = {
          ...result.story,
          ...file.story,
          file: markRaw(result),
          variants: file.story.variants.map(variant => mapStoryVariant(
            variant,
            existingFile.story.variants.find(item => item.id === variant.id),
          )),
        }
      }
      else if (key !== 'component') {
        result[key] = file[key]
      }
    }
  }
  else {
    result = {
      ...file,
      component: markRaw(file.component),
      story: {
        ...file.story,
        title: file.story.title,
        file: null as unknown as StoryFile,
        variants: file.story.variants.map(variant => mapStoryVariant(variant)),
        slots: createEmptySlots,
      },
    }
    result.story.file = markRaw(result)
  }

  return result
}

/**
 * Maps a story variant into the reactive preview shape expected by the
 * Histoire story runtime.
 */
export function mapStoryVariant(variant: MappableVariant, existingVariant?: Variant): Variant {
  let result: Variant

  if (existingVariant) {
    result = existingVariant
    for (const key in variant) {
      if (!copiedFromExistingVariant.includes(key)) {
        result[key] = variant[key]
      }
    }
  }
  else {
    result = {
      ...variant,
      state: reactive({
        _hPropState: {},
        _hPropDefs: [],
      }),
      setupApp: null,
      slots: createEmptySlots,
      previewReady: false,
    }
  }

  return result
}
