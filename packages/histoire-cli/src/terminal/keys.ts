/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import type { ReadStream } from 'node:tty'
import { emitKeypressEvents } from 'node:readline'

/** Normalized key press delivered to the terminal session. */
export interface TerminalKey {
  /** Key name: `up`, `down`, `pageup`, `pagedown`, `home`, `end`, `return`, `escape`, `tab`, `backspace`, `delete`, or the lowercase letter. */
  name: string
  /** Printable text exactly as typed (`R`, `/`, `é`); undefined for control and navigation keys. */
  char?: string
  ctrl: boolean
  meta: boolean
  shift: boolean
}

/** Stream surface the input owner needs; `process.stdin` satisfies it. */
export type KeyInputStream = Pick<ReadStream, 'on' | 'off' | 'resume' | 'pause' | 'setRawMode' | 'isRaw' | 'readableFlowing' | 'listenerCount'>

/** Owner of raw mode and the keypress subscription of one input stream. */
export interface KeyInput {
  /** Enters raw mode and starts delivering keys. Idempotent. */
  attach: () => void
  /** Restores the raw/flow state seen at attach and removes only the owned listener. Idempotent. */
  detach: () => void
  /** Whether keys are currently delivered. */
  readonly attached: boolean
}

/** Lone Escape is reported after this delay; short so leaving views feels immediate. */
const ESCAPE_TIMEOUT_MS = 100

/**
 * Normalizes a `node:readline` keypress event.
 * @param text Decoded text of the event.
 * @param key Readline's key description.
 */
export function normalizeKey(text: string | undefined, key: { name?: string, ctrl?: boolean, meta?: boolean, shift?: boolean } | undefined): TerminalKey {
  const ctrl = key?.ctrl === true
  const meta = key?.meta === true
  const printable = !ctrl && !meta && text !== undefined && text.length > 0 && !/[\u0000-\u001F\u007F-\u009F]/.test(text)
  return {
    name: key?.name ?? text ?? '',
    ...(printable ? { char: text } : {}),
    ctrl,
    meta,
    shift: key?.shift === true || (printable && text !== text!.toLowerCase()),
  }
}

/**
 * Owns raw input for the panel. Only one instance may be attached to a stream at a time
 * (the session guarantees it); attach and detach are paired and preserve the prior state.
 * @param options Input stream and key callback.
 * @param options.stdin Input stream whose raw mode and flow state are borrowed.
 * @param options.onKey Receives each decoded key.
 */
export function createKeyInput(options: { stdin: KeyInputStream, onKey: (key: TerminalKey) => void }): KeyInput {
  const { stdin } = options
  let listener: ((text: string | undefined, key: Parameters<typeof normalizeKey>[1]) => void) | undefined
  let wasRaw = false
  let wasFlowing = false
  return {
    get attached() {
      return listener !== undefined
    },
    attach() {
      if (listener) return
      // Idempotent per stream; the escape timeout only applies when this call is the first.
      emitKeypressEvents(stdin as ReadStream, { escapeCodeTimeout: ESCAPE_TIMEOUT_MS } as never)
      wasRaw = stdin.isRaw === true
      wasFlowing = stdin.readableFlowing === true
      listener = (text, key) => options.onKey(normalizeKey(text, key))
      stdin.on('keypress', listener)
      stdin.setRawMode(true)
      stdin.resume()
    },
    detach() {
      if (!listener) return
      stdin.off('keypress', listener)
      listener = undefined
      stdin.setRawMode(wasRaw)
      // A stream we started reading must not keep the process alive after release.
      if (!wasFlowing) stdin.pause()
    },
  }
}
