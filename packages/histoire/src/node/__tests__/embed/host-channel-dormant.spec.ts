import { withStoryExecution } from '@histoire/shared'
import { afterEach, expect, it, vi } from 'vitest'
import { installRuntimeHostChannels, useHostChannel } from '../../../../../histoire-app/src/app/util/host-channel.js'
import { deferred } from '../utils/mcp/deferred.js'

let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('keeps collection and controls replicas dormant without allocating DOM observers or callbacks', async () => {
  const observer = vi.fn(() => {
    throw new Error('Dormant channel allocated observer')
  })
  vi.stubGlobal('MutationObserver', observer)
  const post = vi.fn()
  const runtime = installRuntimeHostChannels({ enabled: false, names: ['factory'], documentId: 'replica', storyId: () => 'book', ready: () => true, post })
  cleanup = runtime.close
  // A controls render can have a real content owner. Disabled scope still wins.
  const target = { isConnected: true, parentNode: null, parentElement: { closest: () => ({ getAttribute: () => 'variant' }) } } as unknown as Node
  const channel = withStoryExecution(() => useHostChannel('factory'), target)
  const listener = vi.fn()
  expect(() => channel.on('application', listener)).not.toThrow()
  await expect(channel.post('application', null)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  expect(() => runtime.receive({ name: 'factory', type: 'application', data: null }, { storyId: 'book', variantId: 'variant' })).toThrowError(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }))
  expect(observer).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(listener).not.toHaveBeenCalled()
  runtime.close()
  const collecting = useHostChannel('factory')
  expect(() => collecting.on('application', listener)).not.toThrow()
  await expect(collecting.post('application', null)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
})

it('retires disconnected actor handle even when its DOM node is reinserted', async () => {
  let prune: MutationCallback
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: MutationCallback) { prune = callback }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('document', {})
  const post = vi.fn()
  const runtime = installRuntimeHostChannels({ names: ['factory'], documentId: 'document', storyId: () => 'book', ready: () => true, post })
  cleanup = runtime.close
  const target = { isConnected: true, parentNode: null, parentElement: { closest: () => ({ getAttribute: () => 'variant' }) } } as unknown as Node
  const channel = withStoryExecution(() => useHostChannel('factory'), target)
  const listener = vi.fn()
  channel.on('application', listener)
  // Browser may batch removal and reinsertion in one MutationObserver turn.
  prune!([{ removedNodes: [target] }] as unknown as MutationRecord[], {} as MutationObserver)
  await expect(channel.post('application', null)).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  runtime.receive({ name: 'factory', type: 'application', data: null }, { storyId: 'book', variantId: 'variant' })
  expect(listener).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  const replacement = withStoryExecution(() => useHostChannel('factory'), target)
  await replacement.post('application', null)
  expect(post).toHaveBeenCalledOnce()
  replacement.on('application', () => {
    throw new Error('Consumer callback failed')
  })
  const received = vi.fn()
  replacement.on('application', received)
  runtime.receive({ name: 'factory', type: 'application', data: { value: 'fresh' } }, { storyId: 'book', variantId: 'variant' })
  expect(received).toHaveBeenCalledOnce()
  expect(replacement.getDroppedCount()).toBe(1)
  runtime.close()
})

it('observes asynchronous story callback failure and ignores failures after retirement', async () => {
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('document', {})
  const options = { names: ['factory'], documentId: 'document', storyId: () => 'book', ready: () => true, post: vi.fn() }
  const runtime = installRuntimeHostChannels(options)
  cleanup = runtime.close
  const target = { isConnected: true, parentNode: null, parentElement: { closest: () => ({ getAttribute: () => 'variant' }) } } as unknown as Node
  const channel = withStoryExecution(() => useHostChannel('factory'), target)
  const late = deferred<void>()
  channel.on('application', async () => {
    throw new Error('Active callback failed')
  })
  channel.on('application', () => late.promise)
  const received = vi.fn()
  channel.on('application', received)
  runtime.receive({ name: 'factory', type: 'application', data: null }, { storyId: 'book', variantId: 'variant' })
  expect(received).toHaveBeenCalledOnce()
  await Promise.resolve()
  await Promise.resolve()
  expect(channel.getDroppedCount()).toBe(1)
  runtime.close()
  const replacement = installRuntimeHostChannels({ ...options, documentId: 'replacement' })
  cleanup = replacement.close
  const fresh = withStoryExecution(() => useHostChannel('factory'), target)
  late.reject(new Error('Retired callback failed'))
  await Promise.resolve()
  await Promise.resolve()
  expect(channel.getDroppedCount()).toBe(1)
  expect(fresh.getDroppedCount()).toBe(0)
})
