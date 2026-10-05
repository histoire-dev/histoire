import { expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

it.each(['success', 'failure'] as const)('shares reentrant connection acquisition and %s outcome before snapshot observers run', async (outcome) => {
  const fixture = sourceFixture()
  const acquisition = deferred<typeof fixture.connection>()
  const failure = new Error('Source unavailable')
  fixture.adapters.connect = vi.fn(() => acquisition.promise)
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  let reentrant: Promise<void> | undefined
  const stop = session.subscribe((snapshot) => {
    if (snapshot.status !== 'connecting') return
    stop()
    reentrant = session.connect()
  })
  try {
    const original = session.connect()
    await vi.waitFor(() => expect(fixture.adapters.connect).toHaveBeenCalled())
    if (outcome === 'success') acquisition.resolve(fixture.connection)
    else acquisition.reject(failure)
    const results = await Promise.allSettled([original, reentrant!])
    await session.dispose()
    expect(fixture.adapters.connect).toHaveBeenCalledTimes(1)
    expect(reentrant).toBe(original)
    expect(fixture.listeners.size).toBe(0)
    if (outcome === 'success') {
      expect(results).toEqual([{ status: 'fulfilled', value: undefined }, { status: 'fulfilled', value: undefined }])
      expect(fixture.close).toHaveBeenCalledTimes(1)
    }
    else {
      expect(results).toEqual([{ status: 'rejected', reason: failure }, { status: 'rejected', reason: failure }])
      expect(fixture.close).not.toHaveBeenCalled()
    }
  }
  finally {
    acquisition.resolve(fixture.connection)
    stop()
    await session.dispose()
  }
})

it('disposal during reconnect publication still closes captured predecessor without acquiring replacement', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  let disposing: Promise<void> | undefined
  try {
    await session.connect()
    fixture.emitDisconnect()
    const stop = session.subscribe((snapshot) => {
      if (snapshot.status !== 'connecting') return
      stop()
      disposing = session.dispose()
    })
    await expect(session.connect()).rejects.toMatchObject({ code: 'DISPOSED' })
    await disposing
    expect(fixture.adapters.connect).toHaveBeenCalledTimes(1)
    expect(fixture.close).toHaveBeenCalledTimes(1)
    expect(fixture.listeners.size).toBe(0)
  }
  finally { await session.dispose() }
})
