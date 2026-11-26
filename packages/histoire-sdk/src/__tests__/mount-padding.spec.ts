import type { HistoireMountContext } from '../adapters/types.js'
import { describe, expect, it } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { sourceFixture } from './fixtures/session.js'

describe('embed padding mount option', () => {
  it('forwards a validated preview padding to the adapter', async () => {
    const fixture = sourceFixture()
    const original = fixture.adapters.mount!
    const contexts: HistoireMountContext[] = []
    fixture.adapters.mount = (context) => {
      contexts.push(context)
      return original(context)
    }
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const primary = session.mount({} as HTMLElement, { surface: 'preview', padding: 0 })
    await primary.ready
    expect(contexts[0].padding).toBe(0)
    await primary.unmount()
    await session.dispose()
  })

  it('rejects padding on surfaces without a variant gutter, and invalid values', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    expect(() => session.mount({} as HTMLElement, { surface: 'tree', padding: 8 })).toThrow('Embed padding requires a preview surface')
    expect(() => session.mount({} as HTMLElement, { surface: 'preview', padding: -1 })).toThrow('Invalid embed padding')
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
  })
})
