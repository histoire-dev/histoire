import type { TerminalLogEvent, TerminalLogLevel } from '@histoire/cli/protocol/core'
import { TERMINAL_BOUNDS } from '@histoire/cli/protocol/core'

/** Console methods whose level cannot be derived from the stream they write to. */
const LEVEL_METHODS = ['log', 'info', 'debug', 'warn', 'error'] as const

/** Stream properties of a Node console through which every emission flows. */
const STREAM_KEYS = [['_stdout', 'log'], ['_stderr', 'error']] as const

/** Handle returned by {@link installConsoleObserver}. */
export interface ConsoleObserver {
  /** Starts forwarding intercepted emissions to `emit` instead of the raw stream; returning false (or throwing) writes the raw text instead. */
  activate: (emit: (event: TerminalLogEvent) => boolean | void) => void
  /** Restores only hooks this observer still owns. */
  dispose: () => void
}

/** Properties looked up on the console with loose typing. */
type ConsoleLike = Record<string, any>

/**
 * Observes console output at the point where Node writes the final text
 * (the console's stream properties), so groups, tables, assertions, counters,
 * timers and traces keep their exact formatting and indentation. Before
 * `activate`, or if forwarding throws, text goes to the original stream, so
 * nothing is dropped. Text above the log bound also takes the raw path. Direct `process.stdout/stderr` writes are never touched.
 * Install before project code is imported.
 * @param target Console to observe; defaults to the global one.
 */
export function installConsoleObserver(target: Console = console): ConsoleObserver {
  const owner = target as unknown as ConsoleLike
  let emit: ((event: TerminalLogEvent) => boolean | void) | undefined
  /** Level named by the console method currently executing, if any. */
  let methodLevel: TerminalLogLevel | undefined
  const restore: Array<() => void> = []

  for (const [key, defaultLevel] of STREAM_KEYS) {
    const original = Object.getOwnPropertyDescriptor(owner, key)
    if (!original) continue
    const read = (): any => original.get ? original.get.call(owner) : original.value
    let wrapped: { source: any, proxy: any } | undefined
    /** Forwards text to the observer, falling back to the raw stream. */
    const write = (stream: any, data: unknown, rest: unknown[]) => {
      if (emit && typeof data === 'string') {
        try {
          const text = data.endsWith('\n') ? data.slice(0, -1) : data
          // Oversized text is written raw: visible output is never cut, and the parent's stream decoder bounds the retained copy.
          if (text.length <= TERMINAL_BOUNDS.logTextLength) {
            // The console's completion callback only reports write errors, so it is not needed.
            if (emit({ level: methodLevel ?? defaultLevel, text }) !== false) return true
          }
        }
        catch {}
      }
      return stream.write(data, ...rest)
    }
    /** Proxy writes through the real stream except for whole-text emissions we forward. */
    const getter = () => {
      const source = read()
      if (wrapped?.source === source) return wrapped.proxy
      const proxy = new Proxy(source, {
        get(stream, property) {
          if (property === 'write') return (data: unknown, ...rest: unknown[]) => write(stream, data, rest)
          const value = Reflect.get(stream, property, stream)
          return typeof value === 'function' ? value.bind(stream) : value
        },
      })
      wrapped = { source, proxy }
      return proxy
    }
    Object.defineProperty(owner, key, { configurable: true, enumerable: original.enumerable, get: getter, set: original.set ?? ((value: unknown) => Object.defineProperty(owner, key, { ...original, get: undefined, set: undefined, value, writable: true })) })
    const installed = Object.getOwnPropertyDescriptor(owner, key)!
    restore.push(() => {
      if (Object.getOwnPropertyDescriptor(owner, key)?.get === installed.get) Object.defineProperty(owner, key, original)
    })
  }

  for (const method of LEVEL_METHODS) {
    const original = owner[method]
    if (typeof original !== 'function') continue
    const hook = function (this: unknown, ...args: unknown[]) {
      const previous = methodLevel
      methodLevel = method
      try {
        return original.apply(this, args)
      }
      finally {
        methodLevel = previous
      }
    }
    owner[method] = hook
    restore.push(() => {
      if (owner[method] === hook) owner[method] = original
    })
  }

  return {
    activate(listener) {
      emit = listener
    },
    dispose() {
      emit = undefined
      for (const undo of restore.splice(0).reverse()) undo()
    },
  }
}
