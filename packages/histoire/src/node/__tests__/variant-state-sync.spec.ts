import { reactive, ref } from '@histoire/vendors/vue'
import { describe, expect, it } from 'vitest'
import { _toRawDeep } from '../../../../histoire-plugin-vue/src/client/app/util.js'
import { applyVariantStateUpdate, createVariantStateSyncGuards, getVariantStateKey } from '../../../../histoire-shared/src/variant-state.js'

describe('variant state sync guards', () => {
  it('apply state to exact variant resolved by id', () => {
    const variants = [
      { id: 'first', state: reactive({ text: 'alpha' }) },
      { id: 'third', state: reactive({ text: 'omega' }) },
    ]
    const guards = createVariantStateSyncGuards()

    const updatedVariant = applyVariantStateUpdate({
      storyId: 'story',
      variantId: 'third',
      state: { text: 'gamma' },
      getVariantById: variantId => variants.find(item => item.id === variantId),
      guards,
    })

    expect(updatedVariant).toBe(variants[1])
    expect(variants[0].state.text).toBe('alpha')
    expect(variants[1].state.text).toBe('gamma')
    expect(guards.consume(getVariantStateKey('story', 'third'))).toBe(true)
    expect(guards.consume(getVariantStateKey('story', 'first'))).toBe(false)
  })

  it('tracks pending sync suppressions per variant key', () => {
    const guards = createVariantStateSyncGuards()
    const firstKey = getVariantStateKey('story', 'first')
    const thirdKey = getVariantStateKey('story', 'third')

    guards.suppress(firstKey)
    guards.suppress(thirdKey)

    expect(guards.consume(firstKey)).toBe(true)
    expect(guards.consume(firstKey)).toBe(false)
    expect(guards.consume(thirdKey)).toBe(true)
  })
})

describe('_toRawDeep', () => {
  it('unwraps nested bundled refs without falling back to external vue helpers', () => {
    const state = reactive({
      nested: {
        label: ref('variant-local'),
      },
    })

    expect(_toRawDeep(state)).toEqual({
      nested: {
        label: 'variant-local',
      },
    })
  })
})
