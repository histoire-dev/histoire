import { reactive } from '@histoire/vendors/vue'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewStateSync } from '../../../../histoire-app/src/app/util/preview-state-sync.js'

describe('createPreviewStateSync', () => {
  it('reapplies local pre-ready edits over stale preview snapshots', () => {
    const variant = reactive({
      id: 'variant',
      previewReady: false,
      state: {
        _hPropDefs: [{ name: 'disabled' }],
        _hPropState: {
          0: {
            disabled: true,
          },
        },
      },
    })
    const postMessage = vi.fn()
    const stateSync = createPreviewStateSync({
      getStoryId: () => 'story',
      getCurrentVariant: () => variant as any,
      getVariantById: variantId => (variantId === variant.id ? variant as any : null),
      postMessage,
    })

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
})
