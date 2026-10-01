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

interface MappableStoryFile extends Omit<StoryFile, 'story' | 'path'> {
  /** Tree path segments; absent for a story file that was never placed in the tree. */
  path?: StoryFile['path']
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
          file: result,
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
      // A story file that never made it into the tree still needs a path: the
      // story runtime reads it unconditionally.
      path: file.path ?? [],
      component: markRaw(file.component),
      story: {
        ...file.story,
        title: file.story.title,
        // Deliberately NOT `markRaw`ed: the mapped file is stored in a `ref`,
        // and `__v_skip` on it would leave the whole story/variant tree
        // non-reactive. Only `component` stays raw.
        file: null as unknown as StoryFile,
        variants: file.story.variants.map(variant => mapStoryVariant(variant)),
        slots: createEmptySlots,
      },
    }
    result.story.file = result
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
