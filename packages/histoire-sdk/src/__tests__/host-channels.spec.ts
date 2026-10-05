import { afterEach, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { deferred, sourceFixture } from './fixtures/session.js'

afterEach(() => vi.restoreAllMocks())

it('keeps handle and subscriptions during grid selection that retains actual owned document', async () => {
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'grid' }).ready
  const channel = session.channels.open('factory')
  const received = vi.fn()
  channel.subscribe(received)
  const selection = session.selection.select({ storyId: 'a:b', variantId: 'other' })
  const duringSelection = vi.fn()
  expect(session.getSnapshot().runtime.runtimeId).toBeNull()
  expect(() => channel.subscribe(duringSelection)).not.toThrow()
  await selection
  for (const listener of fixture.frameListeners) listener({ type: 'channel', ...fixture.owner(), message: { name: 'factory', type: 'actor', data: null, runtimeId: fixture.runtime().runtimeId, target: { storyId: 'a:b', variantId: 'c' } } })
  expect(received).toHaveBeenCalledOnce()
  expect(duringSelection).toHaveBeenCalledOnce()
  fixture.request.mockImplementation(async () => null)
  await expect(channel.post('host', null)).resolves.toBeUndefined()
  await session.dispose()
})

it('retires a never-used pre-mount handle when data source disconnects and caller reconnects', async () => {
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  const channel = session.channels.open('factory')
  fixture.emitDisconnect()
  await session.connect()
  expect(() => channel.subscribe(vi.fn())).toThrowError(expect.objectContaining({ code: 'RUNTIME_CHANGED' }))
  await session.dispose()
})

it('retires a handle opened before preview even when its first post happens after replacement', async () => {
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  const channel = session.channels.open('factory')
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'preview' }).ready
  fixture.request.mockImplementation(async () => null)
  fixture.reload()
  fixture.ready()
  await expect(channel.post('pick', null)).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  await session.dispose()
})

it('requires explicitly enabled names and ready primary, never queues a post', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  expect(() => session.channels.open('factory')).toThrowError(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }))
  await session.dispose()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const enabled = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await enabled.connect()
  const channel = enabled.channels.open('factory')
  await expect(channel.post('pick', null)).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
  expect(() => enabled.channels.open('other')).toThrowError(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }))
  await enabled.selection.select({ storyId: 'a:b', variantId: 'c' })
  await enabled.mount({} as HTMLElement, { surface: 'grid' }).ready
  fixture.request.mockImplementation(async () => null)
  await channel.post('pick', { command: 'selection.select' })
  expect(fixture.request).toHaveBeenLastCalledWith('channel.post', { name: 'factory', type: 'pick', data: { command: 'selection.select' } }, expect.objectContaining({ runtimeId: 'document-1', target: { storyId: 'a:b', variantId: 'c' } }))
  await enabled.dispose()
})

it('preserves grid origin, isolates subscribers, drops stale traffic and pending posts', async () => {
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'grid' }).ready
  const channel = session.channels.open('factory')
  const received = vi.fn()
  channel.subscribe(() => {
    throw new Error('Consumer failure')
  })
  const unsubscribe = channel.subscribe(received)
  const notification = { type: 'channel' as const, ...fixture.owner(), message: { name: 'factory', type: 'pick', data: null, target: { storyId: 'a:b', variantId: 'c' }, runtimeId: 'document-1' } }
  for (const listener of fixture.frameListeners) listener(notification)
  expect(received).toHaveBeenCalledOnce()
  const wait = deferred<null>()
  fixture.request.mockImplementation(command => command === 'channel.post' ? wait.promise : Promise.resolve(null))
  const pending = channel.post('pick', null)
  fixture.reload()
  await expect(pending).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  for (const listener of fixture.frameListeners) listener(notification)
  expect(received).toHaveBeenCalledOnce()
  wait.resolve(null)
  fixture.ready()
  await expect(channel.post('pick', null)).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  unsubscribe()
  await session.dispose()
})

it('observes asynchronous listener failures without charging a replacement runtime', async () => {
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'grid' }).ready
  const channel = session.channels.open('factory')
  const late = deferred<void>()
  channel.subscribe(async () => {
    throw new Error('Active callback failed')
  })
  channel.subscribe(() => late.promise)
  const received = vi.fn()
  channel.subscribe(received)
  for (const listener of fixture.frameListeners) listener({ type: 'channel', ...fixture.owner(), message: { name: 'factory', type: 'actor', data: null, runtimeId: fixture.runtime().runtimeId, target: { storyId: 'a:b', variantId: 'c' } } })
  expect(received).toHaveBeenCalledOnce()
  await Promise.resolve()
  await Promise.resolve()
  expect(channel.getDroppedCount()).toBe(1)
  fixture.reload()
  fixture.ready()
  const replacement = session.channels.open('factory')
  late.reject(new Error('Retired callback failed'))
  await Promise.resolve()
  await Promise.resolve()
  expect(replacement.getDroppedCount()).toBe(0)
  await session.dispose()
})

it('shares rate budgets across handles and channel names and rejects malformed incoming data', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  const fixture = sourceFixture()
  fixture.descriptor.capabilities.hostChannels = { available: true, channels: ['factory', 'other'] }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'grid' }).ready
  fixture.request.mockImplementation(async () => null)
  const channels = [session.channels.open('factory'), session.channels.open('other')]
  const received = vi.fn()
  channels.forEach(channel => channel.subscribe(received))
  for (let index = 0; index < 50; index++) await channels[index % 2].post('pick', index)
  await expect(session.channels.open('other').post('pick', null)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  for (let index = 0; index < 51; index++) {
    for (const listener of fixture.frameListeners) listener({ type: 'channel', ...fixture.owner(), message: { name: index % 2 ? 'other' : 'factory', type: 'pick', data: index, runtimeId: fixture.runtime().runtimeId, target: { storyId: 'a:b', variantId: index % 2 ? 'other' : 'c' } } })
  }
  expect(received).toHaveBeenCalledTimes(50)
  expect(received.mock.calls[1][0].target).toEqual({ storyId: 'a:b', variantId: 'other' })
  for (const listener of fixture.frameListeners) listener({ type: 'channel', ...fixture.owner(), message: { name: 'factory', type: 'pick', data: undefined as any, runtimeId: fixture.runtime().runtimeId, target: { storyId: 'a:b', variantId: 'c' } } })
  expect(received).toHaveBeenCalledTimes(50)
  expect(channels[0].getDroppedCount()).toBe(3)
  await session.dispose()
})
