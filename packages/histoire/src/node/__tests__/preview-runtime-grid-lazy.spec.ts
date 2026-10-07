// @vitest-environment jsdom
import { SANDBOX_READY, VARIANT_READY } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { type Component, defineComponent, h, onMounted } from 'vue'
import { createPreviewRuntimeApp } from './utils/preview-runtime-app.js'

/** Deferred module keeps generated runtime selection work under test control. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return {
    /** Module value consumed by generated runtime after the gate opens. */
    promise,
    /** Opens the module gate for the test. */
    resolve,
  }
}

/** Grid actor publishes readiness only after the runtime actually mounts it. */
function createGridComponent(): Component {
  return defineComponent({
    name: 'DeferredRuntimeGrid',
    props: ['story', 'variant', 'readyVariantIds'],
    emits: ['ready', 'select'],
    /** Mounts a visible actor and reports its actual framework readiness. */
    setup(props, { emit }) {
      onMounted(() => emit('ready', props.variant.id))
      return () => h('div', { 'data-runtime-grid': props.story.id }, props.variant.id)
    },
  })
}

describe('generated preview runtime grid loading', () => {
  it('waits for the initial grid module before publishing sandbox or variant readiness', async () => {
    const module = createDeferred<Component>()
    const loadGridComponent = vi.fn(() => module.promise)
    const runtime = createPreviewRuntimeApp({ grid: true, loadGridComponent })

    try {
      await runtime.ticks()
      expect(loadGridComponent).toHaveBeenCalledOnce()
      expect(runtime.messages.filter(message => [SANDBOX_READY, VARIANT_READY].includes(message.type))).toEqual([])

      module.resolve(createGridComponent())
      await runtime.ticks()
      await runtime.frames()

      expect(runtime.messages.filter(message => message.type === SANDBOX_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'first' }),
      ])
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'first' }),
      ])
      expect(runtime.container.querySelector('[data-runtime-grid="story"]')?.textContent).toBe('first')
    }
    finally {
      runtime.close()
    }
  })

  it('lazy-loads a later grid selection and ignores it when a newer selection supersedes it', async () => {
    const module = createDeferred<Component>()
    const loadGridComponent = vi.fn(() => module.promise)
    const runtime = createPreviewRuntimeApp({ loadGridComponent })

    try {
      await runtime.frames()
      expect(loadGridComponent).not.toHaveBeenCalled()
      runtime.messages.length = 0

      const gridSelection = runtime.select('first', 1, true)
      await runtime.ticks()
      expect(loadGridComponent).toHaveBeenCalledOnce()
      expect(runtime.messages.filter(message => [SANDBOX_READY, VARIANT_READY].includes(message.type))).toEqual([])

      const replacement = runtime.select('second', 2, false)
      await runtime.frames()
      await replacement
      expect(runtime.messages.filter(message => message.type === SANDBOX_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'second', selectionVersion: 2 }),
      ])
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'second', selectionVersion: 2 }),
      ])

      module.resolve(createGridComponent())
      await gridSelection
      await runtime.frames()

      expect(runtime.messages.filter(message => message.type === SANDBOX_READY)).toHaveLength(1)
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'second', selectionVersion: 2 }),
      ])
      expect(runtime.container.querySelector('[data-runtime-grid]')).toBeNull()
    }
    finally {
      runtime.close()
    }
  })
})
