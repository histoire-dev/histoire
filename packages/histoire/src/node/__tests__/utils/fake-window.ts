/**
 * Origin every fake host/sandbox document in the specs is served from.
 *
 * The live preview is always same-origin with the host, so a single origin is
 * enough to model both sides of the postMessage protocol.
 */
export const FAKE_ORIGIN = 'http://localhost:3000'

/** One recorded `window.parent.postMessage(payload, targetOrigin)` call. */
export interface RecordedParentMessage {
  payload: any
  targetOrigin: string | undefined
}

export interface FakeWindowOptions {
  /** Document origin. Defaults to {@link FAKE_ORIGIN}. */
  origin?: string
  /** Full document URL. Defaults to `<origin>/`. */
  href?: string
}

export interface FakeWindowHandle {
  /** The object installed as `globalThis.window`. */
  window: any
  /** Payloads the module under test posted to `window.parent`. */
  parentMessages: RecordedParentMessage[]
  /**
   * Delivers a `message` event to every listener the module under test
   * registered, in registration order.
   */
  dispatchMessage: (event: any) => void
  /** Restores the globals this handle replaced. */
  uninstall: () => void
}

/**
 * Installs a minimal fake `window`/`location` pair on `globalThis`.
 *
 * The app-side preview modules are plain postMessage plumbing, so the specs
 * run them in the package's default `node` environment (a real DOM environment
 * would defeat the dependency mocks they rely on) against this stand-in rather
 * than a browser. `setTimeout`/`clearTimeout` delegate through `globalThis` so
 * vitest fake timers still apply to code calling `window.setTimeout`.
 *
 * @param options Document origin/href to model.
 * @returns A handle to drive and later uninstall the fake window.
 */
export function installFakeWindow(options: FakeWindowOptions = {}): FakeWindowHandle {
  const origin = options.origin ?? FAKE_ORIGIN
  const href = options.href ?? `${origin}/`
  const messageListeners = new Set<(event: any) => void>()
  const parentMessages: RecordedParentMessage[] = []

  const location = { origin, href }
  const fakeWindow: any = {
    location,
    parent: {
      postMessage: (payload: any, targetOrigin?: string) => {
        parentMessages.push({ payload, targetOrigin })
      },
    },
    addEventListener: (type: string, listener: (event: any) => void) => {
      if (type === 'message') {
        messageListeners.add(listener)
      }
    },
    removeEventListener: (type: string, listener: (event: any) => void) => {
      if (type === 'message') {
        messageListeners.delete(listener)
      }
    },
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id: any) => globalThis.clearTimeout(id),
  }

  const previousWindow = (globalThis as any).window
  const previousLocation = (globalThis as any).location
  ;(globalThis as any).window = fakeWindow
  ;(globalThis as any).location = location

  return {
    window: fakeWindow,
    parentMessages,
    dispatchMessage(event: any) {
      for (const listener of messageListeners) {
        listener(event)
      }
    },
    uninstall() {
      ;(globalThis as any).window = previousWindow
      ;(globalThis as any).location = previousLocation
    },
  }
}
