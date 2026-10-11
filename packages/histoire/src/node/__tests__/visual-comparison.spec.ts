import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { createCanonicalCase, createMatrixCase } from '../visual/cases.js'
import { compareVisualImages, visualPixelsIdentical } from '../visual/compare.js'
import { resolveVisualConfig } from '../visual/config.js'

/** Independently authored pixels make missing comparisons fail decisively. */
function image(changed = false, width = 4, compression = 9) {
  const png = new PNG({ width, height: 4 })
  png.data.fill(255)
  if (changed) {
    png.data.set([0, 0, 0, 255], 0)
  }
  return PNG.sync.write(png, { deflateLevel: compression })
}

describe('visual comparisons', () => {
  it('compares decoded pixels and detects a known changed pixel', async () => {
    expect((await compareVisualImages(image(), image(false, 4, 0), { threshold: 0, includeAA: true, maxDiffPixelRatio: 0 })).status).toBe('passed')
    const changed = await compareVisualImages(image(), image(true), { threshold: 0, includeAA: true, maxDiffPixelRatio: 0 })
    expect(changed).toMatchObject({ status: 'changed', diffPixels: 1, diffPixelRatio: 1 / 16 })
    expect(PNG.sync.read(Buffer.from(changed.diff!)).width).toBe(4)
    expect((await compareVisualImages(image(), image(true), { threshold: 0, includeAA: true, maxDiffPixelRatio: 1 / 16 })).status).toBe('passed')
  })

  it('rejects different dimensions and malformed image data', async () => {
    expect((await compareVisualImages(image(), image(false, 5), { threshold: 0.1, includeAA: false, maxDiffPixelRatio: 1 })).status).toBe('incompatible')
    await expect(compareVisualImages(image(), new Uint8Array([1, 2, 3]), { threshold: 0.1, includeAA: false, maxDiffPixelRatio: 0 })).rejects.toThrow()
  })

  it('detects exact pixel identity regardless of PNG encoding', async () => {
    expect(await visualPixelsIdentical(image(), image(false, 4, 0))).toBe(true)
    expect(await visualPixelsIdentical(image(), image(true))).toBe(false)
    expect(await visualPixelsIdentical(image(), image(false, 5))).toBe(false)
  })
})

describe('visual cases and configuration', () => {
  it('has stable scoped identities and preserves scalar types', () => {
    const first = createMatrixCase({ storyId: 'button', variantId: 'default', label: 'Cell', propsOverride: { size: 1, disabled: false } })
    expect(createMatrixCase({ storyId: 'button', variantId: 'default', label: 'Renamed', propsOverride: { disabled: false, size: 1 } }).id).toBe(first.id)
    expect(createMatrixCase({ storyId: 'button', variantId: 'default', label: 'Cell', propsOverride: { size: '1', disabled: false } }).id).not.toBe(first.id)
    expect(createCanonicalCase('button', 'default', 'Button')).not.toEqual(createCanonicalCase('other', 'default', 'Other'))
    expect(() => createMatrixCase({ storyId: 'button', variantId: 'default', label: 'Cell', propsOverride: { _hInternal: true } })).toThrow()
    expect(() => createMatrixCase({ storyId: 'button', variantId: 'default', label: 'Cell', propsOverride: 1 as any })).toThrow('Invalid saved visual case')
    expect(() => createMatrixCase({ storyId: 'button', variantId: 'default', label: {} as any, propsOverride: {} })).toThrow('Invalid saved visual case')
  })

  it('is opt-in and rejects invalid or ambiguous profiles', () => {
    expect(resolveVisualConfig(undefined)).toBeUndefined()
    expect(resolveVisualConfig({ enabled: false })).toBeUndefined()
    expect(resolveVisualConfig({})?.profiles[0]).toMatchObject({ id: 'desktop-light', width: 1024, height: 640, colorScheme: 'light' })
    expect(resolveVisualConfig({ profiles: [{ id: 'tiny', width: 1, height: 1 }] })?.profiles[0]).toMatchObject({ width: 1, height: 1 })
    expect(() => resolveVisualConfig({ profiles: [] })).toThrow()
    expect(() => resolveVisualConfig({ profiles: [{ id: 'same' }, { id: 'same' }] })).toThrow()
    expect(() => resolveVisualConfig({ profiles: [{ id: 'bad', width: 0 }] })).toThrow()
  })
})
