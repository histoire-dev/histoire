import { describe, expect, it } from 'vitest'
import { getHistoireColorChannels, parseColor } from '../theme/color.js'

describe('shared theme colors', () => {
  it('accepts shorthand/full hex and preserves alpha without confusing capture groups', () => {
    expect(parseColor('#abc')).toEqual({ mode: 'rgb', color: ['170', '187', '204'], alpha: undefined })
    expect(parseColor('#0f08')).toEqual({ mode: 'rgb', color: ['0', '255', '0'], alpha: String(136 / 255) })
    expect(parseColor('#12345678')).toEqual({ mode: 'rgb', color: ['18', '52', '86'], alpha: String(120 / 255) })
    expect(parseColor('var(--host-color)')).toBeNull()
    expect(parseColor(null)).toBeNull()
  })
  it('converts RGB percentages and HSL units to shared RGB channels with separate alpha', () => {
    expect(getHistoireColorChannels(parseColor('rgb(100% 0% 50% / 25%)')!)).toEqual({ channels: '255 0 127.5', alpha: '0.25' })
    expect(getHistoireColorChannels(parseColor('hsl(120deg 100% 50% / .5)')!)).toEqual({ channels: '0 255 0', alpha: '0.5' })
    expect(getHistoireColorChannels(parseColor('hsla(.5turn, 100%, 50%, 75%)')!)).toEqual({ channels: '0 255 255', alpha: '0.75' })
    expect(getHistoireColorChannels(parseColor('transparent')!)).toEqual({ channels: '0 0 0', alpha: '0' })
  })
})
