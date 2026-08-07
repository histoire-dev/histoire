import { describe, expect, it } from 'vitest'
import { readAppSourceEntries } from './utils/app-source.js'
import { generatePreviewRuntimeSource } from './utils/preview-runtime-source.js'

/**
 * Whole-tree guard on the host <-> preview iframe postMessage contract.
 *
 * Every message crossing that boundary must carry the `__histoire` marker (both
 * sides drop messages without it, see `isTrustedFrameMessage`) and must name an
 * explicit target origin (never '*', which would leak state/event/test payloads
 * to any cross-origin page embedding the same-origin sandbox).
 *
 * Both halves of the channel live where this Node suite cannot execute them:
 * the host half is spread over `.vue` single-file components, the preview half
 * is a generated source string. So the invariant is asserted at the source
 * level — but over the WHOLE app tree plus the generated runtime, so a new call
 * site cannot silently opt out and a file move cannot quietly disable it.
 */

/** One `postMessage(...)` call site found in a scanned source. */
interface PostMessageCall {
  /** Where it was found, for assertion messages. */
  location: string
  /** Receiver expression the method was called on, e.g. `window.parent?.`. */
  receiver: string
  /** Raw text of the argument list, brackets balanced. */
  args: string
}

/**
 * Splits a balanced argument list into its top-level arguments.
 *
 * @param args Raw text between the call parentheses.
 */
function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0

  for (let cursor = 0; cursor < args.length; cursor++) {
    const char = args[cursor]
    if (char === '(' || char === '[' || char === '{') {
      depth++
    }
    else if (char === ')' || char === ']' || char === '}') {
      depth--
    }
    else if (char === ',' && depth === 0) {
      parts.push(args.slice(start, cursor).trim())
      start = cursor + 1
    }
  }

  parts.push(args.slice(start).trim())
  return parts.filter(part => part.length > 0)
}

/**
 * True for a receiver that really is another browsing context — the only calls
 * this contract governs.
 *
 * `hostWindow` is what the preview runtime resolves the embedding window to
 * (`getHostWindow()`), the host half reaches the sandbox through
 * `contentWindow`.
 *
 * `options.postMessage(...)`-style receivers are injected transports (the
 * caller hands in a function that ultimately delegates to one of these real
 * ones), so they are covered by their own unit tests instead.
 */
function isFrameBoundaryReceiver(receiver: string) {
  return receiver.includes('parent')
    || receiver.includes('hostWindow')
    || receiver.includes('contentWindow')
}

/**
 * Finds every cross-frame `postMessage(` call in a source and returns its
 * argument text, balancing brackets so an inline object payload is captured
 * whole.
 *
 * @param location Label identifying the scanned source.
 * @param source Source text to scan.
 */
function findPostMessageCalls(location: string, source: string): PostMessageCall[] {
  const calls: PostMessageCall[] = []
  const marker = 'postMessage('
  let index = source.indexOf(marker)

  while (index !== -1) {
    // Walk back over the member chain to recover the receiver expression.
    let receiverStart = index
    while (receiverStart > 0 && /[\w$?.]/.test(source[receiverStart - 1])) {
      receiverStart--
    }

    // Start on the opening parenthesis so the depth counter closes on its match.
    let cursor = index + marker.length - 1
    let depth = 0

    for (; cursor < source.length; cursor++) {
      const char = source[cursor]
      if (char === '(' || char === '[' || char === '{') {
        depth++
      }
      else if (char === ')' || char === ']' || char === '}') {
        depth--
        if (depth === 0) {
          break
        }
      }
    }

    const receiver = source.slice(receiverStart, index)
    if (isFrameBoundaryReceiver(receiver)) {
      calls.push({ location, receiver, args: source.slice(index + marker.length, cursor) })
    }
    index = source.indexOf(marker, cursor)
  }

  return calls
}

/** Every scanned source: the app tree plus the generated preview runtime. */
const scannedSources: [string, string][] = [
  ...readAppSourceEntries('app'),
  ['<generated preview runtime>', generatePreviewRuntimeSource()],
]

const allCalls = scannedSources.flatMap(([location, source]) => findPostMessageCalls(location, source))

/** Sources that actually post across the frame boundary. */
const postingSources = scannedSources.filter(([location]) => allCalls.some(call => call.location === location))

describe('host <-> preview postMessage contract', () => {
  it('scans every call site of both halves of the channel', () => {
    // Sanity check on the scanner itself: if it silently matched nothing, every
    // assertion below would pass vacuously.
    expect(postingSources.length).toBeGreaterThanOrEqual(4)
    expect(allCalls.length).toBeGreaterThanOrEqual(5)
    // The preview half must be in there, not only the host half.
    expect(allCalls.some(call => call.location === '<generated preview runtime>')).toBe(true)
  })

  it('never posts to a wildcard target origin', () => {
    for (const call of allCalls) {
      // A missing target origin is reported by the next test; here only the
      // explicitly-wildcard case matters.
      const targetOrigin = splitTopLevelArgs(call.args)[1] ?? ''
      expect(targetOrigin, `${call.location}: postMessage(${call.args})`).not.toMatch(/^['"`]\*['"`]$/)
    }
  })

  it('always names an explicit target origin', () => {
    for (const call of allCalls) {
      // Omitting the argument defaults to the poster's own origin in some
      // engines and to '*' in others — pin it explicitly at every call site.
      expect(splitTopLevelArgs(call.args), `${call.location}: postMessage(${call.args})`).toHaveLength(2)
    }
  })

  it('marks every message so the other side does not drop it', () => {
    for (const [location, source] of postingSources) {
      // The marker is either inline in the payload literal or set on the
      // message object built just above the call, so it is asserted per file.
      expect(source, location).toContain('__histoire: true')
    }
  })
})
