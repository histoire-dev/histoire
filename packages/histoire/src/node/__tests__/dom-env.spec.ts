// @vitest-environment node
import { Blob as NodeBlob } from 'node:buffer'
import { expect, it, vi } from 'vitest'
import { createDomEnv } from '../dom/env.js'

it('exposes the default scroll margin on collection IntersectionObservers', () => {
  const env = createDomEnv()
  try {
    const observer = new window.IntersectionObserver(() => {})
    expect(observer.scrollMargin).toBe('0px 0px 0px 0px')
  }
  finally {
    env.destroy()
  }
})

it('lets story modules allocate distinct worker blob URLs during collection', () => {
  const nativeURL = globalThis.URL
  const nativeCreateObjectURL = nativeURL.createObjectURL
  const env = createDomEnv()
  try {
    const worker = new window.Blob(['self.onmessage = () => {}'], { type: 'text/javascript' })
    const urls = [worker, worker, new NodeBlob(['other worker'])].map(blob => window.URL.createObjectURL(blob))
    expect(new Set(urls).size).toBe(3)
    for (const href of urls) {
      const url = new URL(href)
      expect(url.protocol).toBe('blob:')
      expect(url.origin).toBe(window.location.origin)
      window.URL.revokeObjectURL(href)
    }
  }
  finally {
    env.destroy()
  }
  expect(globalThis.URL).toBe(nativeURL)
  expect(globalThis.URL.createObjectURL).toBe(nativeCreateObjectURL)
})

it('releases window timers and document before restoring globals, once', async () => {
  const nativeDelay = globalThis.setTimeout
  const env = createDomEnv()
  const document = globalThis.document
  const tick = vi.fn()
  const cancel = env.window.clearInterval
  const timer = env.window.setInterval(tick, 5)
  try {
    await new Promise(resolve => nativeDelay(resolve, 30))
    expect(tick).toHaveBeenCalled()
    env.destroy()
    const count = tick.mock.calls.length
    await new Promise(resolve => nativeDelay(resolve, 30))
    expect(tick).toHaveBeenCalledTimes(count)
    expect(document.body?.childNodes.length ?? 0).toBe(0)
    const next = createDomEnv()
    try {
      env.destroy()
      expect(globalThis.document).toBe(next.window.document)
    }
    finally { next.destroy() }
  }
  finally {
    cancel(timer)
    env.destroy()
  }
})

it('keeps native BroadcastChannel delivery usable after installing jsdom globals', async () => {
  if (typeof BroadcastChannel !== 'function') return
  const nativeEvent = Event
  const nativeMessageEvent = MessageEvent
  const env = createDomEnv()
  expect(Event).toBe(nativeEvent)
  expect(MessageEvent).toBe(nativeMessageEvent)
  const name = `dom-env-${crypto.randomUUID()}`
  const sender = new BroadcastChannel(name)
  const receiver = new BroadcastChannel(name)
  try {
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('BroadcastChannel message timed out')), 1_000)
      receiver.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data)
      }
    })
    sender.postMessage('received')
    await expect(received).resolves.toBe('received')
  }
  finally {
    sender.close()
    receiver.close()
    env.destroy()
  }
})

it('installs jsdom web storage over Node 25+ built-in storage globals', () => {
  // Node 25+ exposes its own `localStorage`/`sessionStorage` getters, which
  // return undefined without `--localstorage-file`. Simulate them here.
  const nativeDescriptors = ['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const nativeGetter = vi.fn(() => undefined)
  for (const [key] of nativeDescriptors) {
    Object.defineProperty(globalThis, key, { get: nativeGetter, configurable: true })
  }
  try {
    const env = createDomEnv()
    try {
      localStorage.setItem('key', 'local')
      sessionStorage.setItem('key', 'session')
      expect(env.window.localStorage.getItem('key')).toBe('local')
      expect(env.window.sessionStorage.getItem('key')).toBe('session')
    }
    finally {
      env.destroy()
    }
    // Native accessors come back as-is and are never invoked.
    expect(Object.getOwnPropertyDescriptor(globalThis, 'localStorage')?.get).toBe(nativeGetter)
    expect(nativeGetter).not.toHaveBeenCalled()
  }
  finally {
    for (const [key, descriptor] of nativeDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete (globalThis as any)[key]
    }
  }
})

it('stubs WebSocket so app plugins can open relative URLs without connecting', () => {
  const nativeWebSocket = globalThis.WebSocket
  const env = createDomEnv()
  try {
    const socket = new WebSocket('/api/realtime/ws')
    expect(socket.url).toBe('ws://localhost:3000/api/realtime/ws')
    expect(socket.readyState).toBe(WebSocket.CONNECTING)
    const closed = vi.fn()
    socket.addEventListener('close', closed)
    socket.send('ignored')
    socket.close()
    expect(socket.readyState).toBe(WebSocket.CLOSED)
    expect(closed).toHaveBeenCalledTimes(1)
  }
  finally {
    env.destroy()
  }
  expect(globalThis.WebSocket).toBe(nativeWebSocket)
})

it('provides an in-memory IndexedDB for each collection window', async () => {
  const env = createDomEnv()
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('collect', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('items')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect([...db.objectStoreNames]).toEqual(['items'])
    expect(IDBKeyRange.only(1).lower).toBe(1)
    db.close()
  }
  finally {
    env.destroy()
  }
  expect('indexedDB' in globalThis).toBe(false)
})
