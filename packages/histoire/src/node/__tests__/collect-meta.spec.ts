import type { ServerStory } from '@histoire/shared'
import { HISTOIRE_META_LIMITS } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { sanitizeCollectedMeta } from '../collect/meta.js'

describe('collected story meta', () => {
  it('turns framework meta into structured-cloneable JSON before leaving the worker', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' }
    cyclic.self = cyclic
    const element = { $$typeof: Symbol.for('react.element'), type: () => null, props: { label: 'x' } }
    const storyData: ServerStory[] = [{
      id: 'button',
      title: 'Button',
      meta: { design: { url: '/a.png' }, component: class Button {}, element, cyclic } as any,
      variants: [
        { id: 'a', title: 'A', meta: { render: () => null, tag: 1 } as any },
        { id: 'b', title: 'B', meta: { text: 'x'.repeat(HISTOIRE_META_LIMITS.bytes) } as any },
      ],
    }]
    sanitizeCollectedMeta(storyData)
    // Tinypool returns worker results with structured clone: any function or symbol throws.
    const cloned = structuredClone(storyData)
    expect(cloned[0].meta).toEqual({ design: { url: '/a.png' }, element: { props: { label: 'x' } }, cyclic: { name: 'loop' } })
    expect(cloned[0].metaOmitted).toBeUndefined()
    expect(cloned[0].variants[0].meta).toEqual({ tag: 1 })
    // Oversized meta is dropped but remembered so the catalog can still warn.
    expect(cloned[0].variants[1]).toEqual({ id: 'b', title: 'B', metaOmitted: true })
    expect(() => JSON.stringify(storyData)).not.toThrow()
  })
})
