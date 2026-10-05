import { runInNewContext } from 'node:vm'
import { measureWireValue } from '@histoire/protocol'
import { applyVariantStateUpdate, createVariantStateSyncGuards } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { toRawDeep } from '../../../../histoire-app/src/app/util/state.js'
import { previewPropsOverride } from '../virtual/preview-runtime/props-override.js'

/** Exercises emitted override service with the existing state synchronization path. */
function createOverrides(state: Record<string, any>) {
  const variant = { id: 'variant', state }
  const postToParent = vi.fn()
  const guards = createVariantStateSyncGuards()
  const runtime = runInNewContext(`${previewPropsOverride()}; ({ applyPropsOverride, reapplyPropsOverride, clearPropsOverrides })`, {
    story: { value: { id: 'story' } },
    variant: { value: variant },
    getVariantById: (id: string) => id === 'variant' ? variant : null,
    applyVariantStateUpdate,
    variantStateGuards: guards,
    toRawDeep,
    measureWireValue,
    postToParent,
    RUNTIME_RESULT: 'result',
    initialSelection: { controls: false },
  })
  return { ...runtime, variant, postToParent, guards }
}

describe('preview matrix prop overrides', () => {
  it('uses control prop-state route without replacing live unrelated state', () => {
    const runtime = createOverrides({
      count: 3,
      callback: () => 'live',
      _hPropDefs: [{ index: 2, props: [{ name: 'size' }, { name: 'disabled' }] }],
      _hPropState: { 2: { size: 'md', label: 'Hello' } },
    })
    runtime.applyPropsOverride({ variantId: 'variant', props: { size: 'lg', disabled: true }, requestId: 'request' })
    expect(runtime.variant.state._hPropState[2]).toEqual({ size: 'lg', disabled: true, label: 'Hello' })
    expect(runtime.variant.state.count).toBe(3)
    expect(runtime.variant.state.callback()).toBe('live')
    expect(runtime.guards.consume('story:variant')).toBe(true)
    expect(runtime.postToParent).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request', result: { supported: true } }))
    runtime.applyPropsOverride({ variantId: 'variant', props: { size: 'sm' } })
    expect(runtime.variant.state._hPropState[2]).toEqual({ size: 'sm', label: 'Hello' })
  })

  it('overrides explicit-hint flat state and reapplies after canonical state sync', () => {
    const runtime = createOverrides({ size: 'md', disabled: false, counter: 1 })
    runtime.applyPropsOverride({ variantId: 'variant', props: { size: 'lg' } })
    Object.assign(runtime.variant.state, { size: 'md', counter: 2 })
    runtime.reapplyPropsOverride('variant')
    expect(runtime.variant.state).toEqual({ size: 'lg', disabled: false, counter: 2 })
    runtime.applyPropsOverride({ variantId: 'variant', props: {} })
    expect(runtime.variant.state.size).toBe('md')
  })

  it('rejects mismatched variants, reserved keys, excessive payloads, and malformed props', () => {
    const runtime = createOverrides({ size: 'md' })
    for (const message of [
      { variantId: 'other', props: { size: 'lg' } },
      { variantId: 'variant', props: { _hPropDefs: [] } },
      { variantId: 'variant', props: { ['__proto__']: { polluted: true } } },
      { variantId: 'variant', props: { size: 'x'.repeat(70_000) } },
      { variantId: 'variant', props: [] },
      { variantId: 'variant', props: { size: Number.NaN } },
    ]) runtime.applyPropsOverride(message)
    expect(runtime.variant.state).toEqual({ size: 'md' })
  })

  it('moves early overrides into the auto-prop path once component definitions arrive', () => {
    const runtime = createOverrides({ size: 'md' })
    runtime.applyPropsOverride({ variantId: 'variant', props: { size: 'lg' } })
    runtime.variant.state._hPropDefs = [{ index: 0, props: [{ name: 'size' }] }]
    runtime.variant.state._hPropState = {}
    runtime.reapplyPropsOverride('variant')
    expect(runtime.variant.state).toMatchObject({ size: 'md', _hPropState: { 0: { size: 'lg' } } })
    runtime.applyPropsOverride({ variantId: 'variant', props: {} })
    expect(runtime.variant.state._hPropState[0]).toEqual({})
  })
})
