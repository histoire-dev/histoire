import type { DOMWindow } from 'jsdom'
import { Blob as NodeBlob } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { IDBCursor, IDBCursorWithValue, IDBDatabase, IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore, IDBOpenDBRequest, IDBRequest, IDBTransaction, IDBVersionChangeEvent } from 'fake-indexeddb'

/** Node's own event classes, captured before jsdom replaces the globals. */
const NativeEventTarget = globalThis.EventTarget
const NativeEvent = globalThis.Event

/**
 * Supplies opaque URLs for libraries that prepare workers while being imported.
 * Collection cannot load browser workers, so the URLs hold no blob data and
 * revoking them needs no cleanup. Browser story runs use the real API.
 * @param window The individual jsdom window owned by this collection pass.
 */
export function installCollectObjectUrls(window: DOMWindow) {
  const { Blob, URL, location: { origin } } = window
  if (typeof URL.createObjectURL === 'function') return

  URL.createObjectURL = (blob) => {
    if (!(blob instanceof Blob || blob instanceof NodeBlob)) {
      throw new TypeError('URL.createObjectURL requires a Blob')
    }
    return `blob:${origin}/${randomUUID()}`
  }
  URL.revokeObjectURL ??= () => {}
}

/**
 * Creates a `WebSocket` class for story collection that never connects.
 *
 * App plugins (realtime sync, dev tools, ...) open sockets while the app boots.
 * jsdom rejects relative or `http:` URLs and would otherwise try to reach a
 * server that doesn't exist during collection. Sockets created here stay in
 * `CONNECTING` until closed, so nothing is sent and no reconnect loop starts.
 * @param baseUrl Document URL that relative socket URLs resolve against.
 */
export function createCollectWebSocket(baseUrl: string) {
  return class CollectWebSocket extends NativeEventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    /** Absolute `ws:`/`wss:` URL, like the browser exposes it. */
    readonly url: string
    readonly protocol = ''
    readonly extensions = ''
    readonly bufferedAmount = 0
    binaryType: BinaryType = 'blob'
    readyState = 0
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onclose: ((event: Event) => void) | null = null

    constructor(url: string | URL, _protocols?: string | string[]) {
      super()
      this.url = toSocketUrl(url, baseUrl)
    }

    /** Data is dropped: there is no server during collection. */
    send(_data: unknown) {}

    /** Closes the socket synchronously and notifies `close` listeners once. */
    close(_code?: number, _reason?: string) {
      if (this.readyState === this.CLOSED) return
      this.readyState = this.CLOSED
      const event = new NativeEvent('close')
      this.onclose?.(event)
      this.dispatchEvent(event)
    }
  }
}

/** Resolves a socket URL like the browser does, mapping `http(s):` to `ws(s):`. */
function toSocketUrl(url: string | URL, baseUrl: string) {
  try {
    const resolved = new URL(url, baseUrl)
    if (resolved.protocol === 'http:') resolved.protocol = 'ws:'
    else if (resolved.protocol === 'https:') resolved.protocol = 'wss:'
    return resolved.href
  }
  catch {
    return String(url)
  }
}

/**
 * IndexedDB globals backed by a fresh in-memory database, so app plugins that
 * open IndexedDB at setup (offline stores, caches) work during collection.
 */
export function createCollectIndexedDb() {
  return {
    indexedDB: new IDBFactory(),
    IDBCursor,
    IDBCursorWithValue,
    IDBDatabase,
    IDBFactory,
    IDBIndex,
    IDBKeyRange,
    IDBObjectStore,
    IDBOpenDBRequest,
    IDBRequest,
    IDBTransaction,
    IDBVersionChangeEvent,
  }
}
