import { expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { isHistoirePrimaryMountActive } from '../session/internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

it('shares exact active primary ownership across SDK copies and retires before async cleanup', async () => {
  const fixture = sourceFixture()
  const closing = deferred<void>()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const primary = session.createHiddenPreview()
  await primary.ready
  vi.resetModules()
  const peer = await import('../session/internal.js')
  try {
    expect(peer.isHistoirePrimaryMountActive(session, primary)).toBe(true)
    expect(isHistoirePrimaryMountActive(session, { ...primary })).toBe(false)
    fixture.surfaceClose.mockImplementationOnce(() => closing.promise)
    const teardown = primary.unmount()
    expect(session.getSnapshot().runtime.mountId).toBe(primary.id)
    expect(peer.isHistoirePrimaryMountActive(session, primary)).toBe(false)
    closing.resolve()
    await teardown
    expect(peer.isHistoirePrimaryMountActive(session, primary)).toBe(false)
  }
  finally {
    closing.resolve()
    await session.dispose()
  }
})
