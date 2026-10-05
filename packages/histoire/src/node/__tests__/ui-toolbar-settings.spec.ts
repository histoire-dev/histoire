import { createDefaultHistoireSettings } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { backgroundPatch, parseViewportSize, viewportDimensions } from '../../../../histoire-app/src/app/components/canvas/toolbar/settings.js'

describe('canvas toolbar settings', () => {
  it('accepts bounded whole-pixel viewport sizes and optional auto height', () => {
    expect(parseViewportSize('375', '812')).toEqual({ responsiveWidth: 375, responsiveHeight: 812, rotate: false })
    expect(parseViewportSize('720', '')).toEqual({ responsiveWidth: 720, responsiveHeight: null, rotate: false })
    expect(parseViewportSize('0', '400')).toBeNull()
    expect(parseViewportSize('375.5', '812')).toBeNull()
    expect(parseViewportSize('720', '-1')).toBeNull()
  })

  it('rotates effective viewport without rewriting logical settings', () => {
    const settings = { ...createDefaultHistoireSettings(), responsiveWidth: 375, responsiveHeight: 812 }
    expect(viewportDimensions(settings)).toEqual({ width: 375, height: 812 })
    expect(viewportDimensions({ ...settings, rotate: true })).toEqual({ width: 812, height: 375 })
  })

  it('maps checkerboard preset through protocol and validates custom hex colors', () => {
    expect(backgroundPatch('$checkerboard')).toEqual({ backgroundColor: 'transparent', checkerboard: true })
    expect(backgroundPatch('#F0a', false, true)).toEqual({ backgroundColor: '#F0a', checkerboard: false })
    expect(backgroundPatch('red', false, true)).toBeNull()
  })
})
