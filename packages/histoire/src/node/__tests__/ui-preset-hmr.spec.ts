import type { ResponsivePreset } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createPresetConfigStore } from '../../../../histoire-app/src/app/stores/presets-config.js'

describe('preset overrides across project defaults', () => {
  it('preserves a local addition when a later project default adopts its label', () => {
    const config = reactive<{ responsivePresets: ResponsivePreset[] }>({ responsivePresets: [] })
    const presets = createPresetConfigStore({ config: () => config })
    presets.addViewport({ label: 'Phone', width: 390 })
    config.responsivePresets.push({ label: 'Phone', width: 320 })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Phone', width: 390 }])
    presets.resetViewports()
    expect(presets.responsivePresets.value).toEqual([{ label: 'Phone', width: 320 }])
  })

  it('keeps renamed project override when another new default adopts its visible label', () => {
    const config = reactive({ responsivePresets: [{ label: 'Phone', width: 375 }] })
    const presets = createPresetConfigStore({ config: () => config })
    presets.updateViewport(0, { label: 'Mobile', width: 390 })
    config.responsivePresets.push({ label: 'Mobile', width: 320 })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Mobile', width: 390 }])
    presets.resetViewports()
    expect(presets.responsivePresets.value).toEqual(config.responsivePresets)
  })
})
