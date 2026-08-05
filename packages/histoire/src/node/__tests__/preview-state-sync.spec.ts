import { reactive, ref } from '@histoire/vendors/vue'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewStateSync } from '../../../../histoire-app/src/app/util/preview-state-sync.js'

describe('createPreviewStateSync', () => {
  it('reapplies local pre-ready edits over stale preview snapshots', () => {
    const variant = reactive({
      id: 'variant',
      previewReady: false,
      state: {
        _hPropDefs: [{ name: 'disabled' }],
        _hPropState: {},
      } as any,
    })
    const postMessage = vi.fn()
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => variant as any,
      getVariantById: variantId => (variantId === variant.id ? variant as any : null),
      postMessage,
    })

    // Initial (immediate) watcher firing: the host's boot snapshot, not an edit.
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)

    // Genuine pre-ready user edit — this is what must survive the snapshot.
    variant.state._hPropState = {
      0: {
        disabled: true,
      },
    }
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)

    stateSync.applyIncomingState('variant', {
      _hPropDefs: [{ name: 'disabled' }],
      _hPropState: {},
    })

    expect(variant.state._hPropState).toEqual({
      0: {
        disabled: true,
      },
    })

    variant.previewReady = true
    stateSync.syncCurrentVariantState()

    expect(postMessage).toHaveBeenCalledWith({
      type: '__histoire:state-sync',
      variantId: 'variant',
      state: {
        _hPropDefs: [{ name: 'disabled' }],
        _hPropState: {
          0: {
            disabled: true,
          },
        },
      },
    })
  })

  it('does not let the initial empty snapshot wipe iframe-provided auto-props', () => {
    // Vitest-mocked stories have no hidden host mount: at setup the host state
    // is just the empty skeleton. Stashing that initial watcher firing and
    // re-applying it over the iframe's boot snapshot would permanently wipe
    // `_hPropDefs`/`_hPropState` (the iframe never re-sends unchanged defs).
    const variant = reactive({
      id: 'variant',
      previewReady: false,
      state: {
        _hPropDefs: [],
        _hPropState: {},
      } as any,
    })
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => variant as any,
      getVariantById: variantId => (variantId === variant.id ? variant as any : null),
      postMessage: vi.fn(),
    })

    // Immediate watcher firing at setup with the empty skeleton.
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)

    // The iframe's rich boot snapshot arrives before VARIANT_READY.
    stateSync.applyIncomingState('variant', {
      _hPropDefs: [{ name: 'disabled' }],
      _hPropState: {
        0: {
          disabled: false,
        },
      },
    })

    expect(variant.state._hPropDefs).toEqual([{ name: 'disabled' }])
    expect(variant.state._hPropState).toEqual({
      0: {
        disabled: false,
      },
    })
  })

  it('never clobbers derived control defs when reapplying a pre-ready edit stash', () => {
    const variant = reactive({
      id: 'variant',
      previewReady: false,
      state: {
        _hPropDefs: [],
        _hPropState: {},
        text: 'default',
      } as any,
    })
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => variant as any,
      getVariantById: variantId => (variantId === variant.id ? variant as any : null),
      postMessage: vi.fn(),
    })

    // Initial firing, then a genuine pre-ready edit (stashed with the host's
    // still-empty defs skeleton).
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)
    variant.state.text = 'edited'
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)

    stateSync.applyIncomingState('variant', {
      _hPropDefs: [{ name: 'disabled' }],
      _hPropState: {},
      text: 'default',
    })

    // The edit survives, but the stash's empty `_hPropDefs` must not replace
    // the snapshot's derived defs — they are story-owned metadata, not an edit.
    expect(variant.state.text).toBe('edited')
    expect(variant.state._hPropDefs).toEqual([{ name: 'disabled' }])
  })

  it('suppresses exactly one local echo for the current variant', () => {
    const variant = reactive({
      id: 'variant',
      previewReady: true,
      state: { text: 'alpha' },
    })
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => variant as any,
      getVariantById: variantId => (variantId === variant.id ? variant as any : null),
      postMessage: vi.fn(),
    })

    // Applying incoming state for the current variant arms one suppression so the
    // resulting local watcher echo is swallowed.
    stateSync.applyIncomingState('variant', { text: 'beta' })

    // First post-apply check consumes the single armed suppression.
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(true)
    // A subsequent genuine local edit must NOT be swallowed.
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)
  })

  it('does not leak suppression when applying state to a non-current variant (grid)', () => {
    const variantA = reactive({
      id: 'a',
      previewReady: true,
      state: { text: 'alpha' },
    })
    const variantB = reactive({
      id: 'b',
      previewReady: true,
      state: { text: 'beta' },
    })
    // Mutable "current variant" ref so the test can switch the active variant,
    // mirroring grid mode where the iframe pushes STATE_SYNC for non-current variants.
    const current = ref<any>(variantA)
    const getVariantById = (variantId: string) => {
      if (variantId === variantA.id) {
        return variantA as any
      }
      if (variantId === variantB.id) {
        return variantB as any
      }
      return null
    }
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => current.value,
      getVariantById,
      postMessage: vi.fn(),
    })

    // Grid: iframe pushes a STATE_SYNC for the non-current variant `b` while `a` is current.
    stateSync.applyIncomingState('b', { text: 'gamma' })

    // State IS applied to the non-current variant.
    expect(variantB.state.text).toBe('gamma')

    // Switch the current variant to `b` and make a genuine local edit.
    current.value = variantB

    // The genuine local edit must NOT be swallowed by a leaked suppression.
    // Old code (suppress for non-current) leaves a pending suppression here -> returns true (bug).
    expect(stateSync.shouldSkipCurrentVariantSync()).toBe(false)
  })
})
