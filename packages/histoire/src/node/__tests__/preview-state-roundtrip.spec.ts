import { applyVariantStateUpdate, createVariantStateSyncGuards } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { nextTick, reactive, watch } from 'vue'
import { createPreviewStateSync } from '../../../../histoire-app/src/app/util/preview-state-sync.js'
import { toRawDeep } from '../../../../histoire-app/src/app/util/state.js'

describe('serialized preview state round trips', () => {
  it('preserves runtime callbacks when host edits another field or seeds controls', () => {
    const onClick = () => 'clicked'
    const runtime = { id: 'variant', state: { count: 0, items: [{ label: 'row', onClick }], callbacks: [onClick, 'initial'] } }
    const host = { id: 'variant', previewReady: true, state: {} as any }
    const sync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => host as any,
      getVariantById: () => host as any,
      postMessage: message => applyVariantStateUpdate({ ...message, getVariantById: () => runtime }),
    })
    sync.applyIncomingState('variant', toRawDeep(runtime.state, true))
    host.state.count = 1
    sync.syncCurrentVariantState()
    expect(runtime.state.count).toBe(1)
    expect(runtime.state.items[0].onClick).toBe(onClick)
    expect(runtime.state.callbacks).toEqual([onClick, 'initial'])

    const controlsCallback = () => 'controls'
    const controls = { state: { count: 0, items: [{ label: 'default', onClick: controlsCallback }] } }
    applyVariantStateUpdate({ variantId: 'variant', state: toRawDeep(host.state, true), getVariantById: () => controls })
    expect(controls.state.items[0]).toEqual({ label: 'row', onClick: controlsCallback })
  })

  it('applies array edits without dropping callbacks on retained rows', () => {
    const onClick = () => 'clicked'
    const variant = { state: { items: [{ label: 'first', removed: true, nested: { removed: true, onClick }, onClick }, { label: 'remove', onClick }] } }
    applyVariantStateUpdate({ variantId: 'variant', state: { items: [{ label: 'edited', nested: {} }] }, getVariantById: () => variant })
    expect(variant.state.items).toEqual([{ label: 'edited', nested: { onClick }, onClick }])
  })

  it('replaces stale control metadata while preserving omitted callback props', () => {
    const onClick = () => 'clicked'
    const variant = { state: {
      _hPropState: { 0: { onClick, label: 'old' } },
      _hPropDefs: [{ name: 'old', type: 'number' }],
    } }
    applyVariantStateUpdate({
      variantId: 'variant',
      state: { _hPropState: { 0: { label: 'new' } }, _hPropDefs: [{ name: 'new' }] },
      getVariantById: () => variant,
    })
    expect(variant.state).toEqual({
      _hPropState: { 0: { onClick, label: 'new' } },
      _hPropDefs: [{ name: 'new' }],
    })
    applyVariantStateUpdate({
      variantId: 'variant',
      state: { _hPropState: {}, _hPropDefs: [] },
      getVariantById: () => variant,
    })
    expect(variant.state).toEqual({ _hPropState: {}, _hPropDefs: [] })
  })

  it('does not suppress the next user edit after an unchanged snapshot', async () => {
    const variant = reactive({ state: { _hPropDefs: [], _hPropState: {}, count: 0 } })
    const guards = createVariantStateSyncGuards()
    const sent: number[] = []
    const stop = watch(() => variant.state, () => {
      if (!guards.consume('story:variant')) sent.push(variant.state.count)
    }, { deep: true })
    try {
      for (const count of [0, 2]) {
        applyVariantStateUpdate({
          storyId: 'story',
          variantId: 'variant',
          state: { _hPropDefs: [], _hPropState: {}, count },
          getVariantById: () => variant,
          guards,
        })
        await nextTick()
        variant.state.count++
        await nextTick()
      }
      expect(sent).toEqual([1, 3])
    }
    finally {
      stop()
    }
  })
})
