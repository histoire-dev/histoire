import { describe, expect, it } from 'vitest'
import { isReactive, nextTick, ref, watch } from 'vue'
import { mapFile } from '../../../../histoire-app/src/app/util/mapping.js'

/**
 * `mapFile` output is stored in a `ref` by the preview runtime
 * (`virtual/preview-runtime/app.ts`) and in the app-side `files` ref
 * (`histoire-app/src/app/App.vue`). Both rely on the mapped file becoming
 * reactive: the story/variant objects reached through it drive the preview
 * (`configReady` mounts the story) and the host UI (`previewReady` opens the
 * side panel). A `markRaw` anywhere on the mapped file silently breaks both.
 */

/** Minimal serialized story file, mirroring what the collector emits. */
function createRawFile() {
  return {
    id: 'story-1',
    component: {},
    story: {
      id: 'story-1',
      title: 'Story',
      variants: [
        { id: 'variant-1', title: 'Variant 1' },
      ],
    },
  } as any
}

describe('mapFile', () => {
  it('keeps the mapped file reactive when stored in a ref', () => {
    const fileRef = ref<any>(null)
    fileRef.value = mapFile(createRawFile())

    expect(isReactive(fileRef.value)).toBe(true)
    expect(isReactive(fileRef.value.story.variants[0])).toBe(true)
  })

  it('tracks variant flag mutations through the mapped file', async () => {
    const fileRef = ref<any>(null)
    fileRef.value = mapFile(createRawFile())

    const variant = fileRef.value.story.variants[0]
    const seen: unknown[] = []
    watch(() => variant.configReady, value => seen.push(value))

    variant.configReady = true
    await nextTick()

    expect(seen).toEqual([true])
  })

  it('reaches the mapped variants back through `story.file`', () => {
    const file = mapFile(createRawFile())

    expect(file.story.file.story.variants[0]).toBe(file.story.variants[0])
    expect(file.story.variants[0].state).toBeTruthy()
  })

  it('keeps the updated file reactive when remapping over an existing one', async () => {
    const fileRef = ref<any>(null)
    fileRef.value = mapFile(createRawFile())

    // HMR path: the collector sends a fresh serialized file, remapped over the
    // previous one so variant state survives.
    fileRef.value = mapFile(createRawFile(), fileRef.value)

    expect(isReactive(fileRef.value)).toBe(true)

    const variant = fileRef.value.story.variants[0]
    const seen: unknown[] = []
    watch(() => variant.previewReady, value => seen.push(value))

    variant.previewReady = true
    await nextTick()

    expect(seen).toEqual([true])
  })
})
