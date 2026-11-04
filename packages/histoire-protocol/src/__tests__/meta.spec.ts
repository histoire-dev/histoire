import { describe, expect, it } from 'vitest'
import { validateHistoireCatalogStory } from '../bridge/catalog.js'
import { HISTOIRE_META_LIMITS, HISTOIRE_WIRE_LIMITS } from '../bridge/limits.js'
import { measureWireValue } from '../bridge/size.js'
import { normalizeHistoireMeta } from '../helpers/meta.js'

/** Builds `{ child: { child: ... } }` with `levels` nested objects under the root. */
function chain(levels: number): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current = root
  for (let index = 0; index < levels; index++) {
    const next: Record<string, unknown> = {}
    current.child = next
    current = next
  }
  return root
}

describe('story metadata', () => {
  const story = { id: 'button', title: 'Button', docsOnly: false, path: ['Button'], variants: [{ id: 'a', title: 'A' }], content: { docs: false, rawSource: true } }

  it('keeps JSON values and drops executable or non-plain values', () => {
    class Component {}
    const cyclic: Record<string, unknown> = { name: 'loop' }
    cyclic.self = cyclic
    const { meta, tooLarge } = normalizeHistoireMeta({
      design: { type: 'figma', url: 'https://figma.com', scale: 2, list: [1, () => {}, 'x', undefined, Number.NaN] },
      setup: () => {},
      component: new Component(),
      element: { $$typeof: Symbol.for('react.element'), [Symbol('key')]: 1 },
      date: new Date(0),
      missing: undefined,
      cyclic,
    })
    expect(tooLarge).toBeUndefined()
    expect(meta).toEqual({ design: { type: 'figma', url: 'https://figma.com', scale: 2, list: [1, 'x'] }, element: {}, cyclic: { name: 'loop' } })
    expect(Object.isFrozen(meta) && Object.isFrozen(meta?.design)).toBe(true)
  })

  it('omits empty or non-object metadata', () => {
    for (const value of [undefined, null, 'meta', [], { fn: () => {} }]) expect(normalizeHistoireMeta(value)).toEqual({})
  })

  it('drops subtrees deeper than the depth bound and stays valid on the wire', () => {
    const { meta } = normalizeHistoireMeta(chain(200))
    let depth = 0
    for (let current = meta as Record<string, unknown> | undefined; current?.child; current = current.child as Record<string, unknown>) depth++
    expect(depth).toBe(HISTOIRE_META_LIMITS.depth)
    expect(() => validateHistoireCatalogStory({ ...story, meta })).not.toThrow()
  })

  it('aborts the copy of shared-reference graphs over the node budget', () => {
    // 30 levels of { a: x, b: x } expand to 2^30 JSON values.
    let shared: Record<string, unknown> = { leaf: 1 }
    for (let index = 0; index < 30; index++) shared = { a: shared, b: shared }
    const started = performance.now()
    expect(normalizeHistoireMeta({ shared })).toEqual({ tooLarge: true })
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reports metadata over the byte budget as too large, and measures what it keeps', () => {
    expect(normalizeHistoireMeta({ text: 'x'.repeat(HISTOIRE_META_LIMITS.bytes) })).toEqual({ tooLarge: true })
    const value = { text: 'é"', list: [1, -0.5, true, null, { k: 'v' }] }
    const { bytes, nodes } = normalizeHistoireMeta(value)
    expect(bytes).toBeGreaterThanOrEqual(measureWireValue(value, { mode: 'json' }))
    expect(nodes).toBe(9)
  })

  it('validates catalog story and variant metadata at wire boundary', () => {
    const valid = validateHistoireCatalogStory({ ...story, meta: { design: { url: 'x' } }, variants: [{ id: 'a', title: 'A', meta: { tag: 1 } }] })
    expect(valid.meta).toEqual({ design: { url: 'x' } })
    expect(() => validateHistoireCatalogStory({ ...story, meta: ['x'] })).toThrow('Invalid catalog metadata')
    expect(() => validateHistoireCatalogStory({ ...story, variants: [{ id: 'a', title: 'A', meta: 'x' }] })).toThrow('Invalid catalog metadata')
    expect(() => validateHistoireCatalogStory({ ...story, meta: { text: 'x'.repeat(HISTOIRE_WIRE_LIMITS.metadata) } })).toThrow()
    expect(() => validateHistoireCatalogStory({ ...story, meta: chain(HISTOIRE_META_LIMITS.depth + 1) })).toThrow()
  })
})
