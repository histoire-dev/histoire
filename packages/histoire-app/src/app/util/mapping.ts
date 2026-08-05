import type { StoryFile, Variant } from '../types'
import { markRaw, reactive } from 'vue'

/**
 * Fresh slot holders for a story/variant.
 *
 * A new object per call: a shared one would let one variant's slots leak into
 * every other variant mapped from the same file.
 */
function createEmptySlots() {
  return {
    default: null,
    controls: null,
    source: null,
  }
}

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

export function mapFile(file: StoryFile, existingFile?: StoryFile): StoryFile {
  let result: StoryFile

  if (existingFile) {
    // Update
    result = existingFile
    for (const key in file) {
      if (key === 'story') {
        result.story = {
          ...result.story,
          ...file.story,
          file: markRaw(result),
          variants: file.story.variants.map(v => mapVariant(v, existingFile.story.variants.find(item => item.id === v.id))),
        }
      }
      else if (key !== 'component') {
        result[key] = file[key]
      }
    }
  }
  else {
    // Create
    result = {
      ...file,
      component: markRaw(file.component),
      story: {
        ...file.story,
        title: file.story.title,
        // Points at the mapped file, not the raw input: `story.file` is read
        // back to reach the mapped variants (and their state).
        file: null as unknown as StoryFile,
        variants: file.story.variants.map(v => mapVariant(v)),
        slots: createEmptySlots,
      },
    }
    result.story.file = markRaw(result)
  }

  return result
}

export function mapVariant(variant: Variant, existingVariant?: Variant): Variant {
  let result: Variant

  if (existingVariant) {
    // Update
    result = existingVariant
    for (const key in variant) {
      if (!copiedFromExistingVariant.includes(key)) {
        result[key] = variant[key]
      }
    }
  }
  else {
    // Create
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
