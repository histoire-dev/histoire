import type { HistoireTestError } from '../types/test.js'

/** Narrows runtime exception-like values before explicit projection. */
function hasProperty(value: unknown, key: string): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && key in value
}

/** Coerces an arbitrary value to a structured-clone / JSON-safe form so it can cross postMessage/WS boundaries. */
function toSerializableRaw(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) // JSON-safe ⇒ clone-safe ⇒ safe for the consumer's JSON.stringify
  }
  catch {
    try {
      return String(value)
    }
    catch {
      return undefined
    }
  }
}

/** Projects runtime error while omitting absent fields required by JSON DTOs. */
export function serializeTestError(error: unknown): HistoireTestError {
  if (error instanceof Error) {
    const payload = error as Error & { diff?: unknown, cause?: unknown }
    const raw = toSerializableRaw(payload.cause)
    return {
      name: payload.name || 'Error',
      message: payload.message || error.toString(),
      ...(payload.stack === undefined ? {} : { stack: payload.stack }),
      ...(typeof payload.diff === 'string' ? { diff: payload.diff } : {}),
      ...(raw === undefined ? {} : { raw }),
    }
  }

  if (error === null || error === undefined) {
    return {
      message: 'Unknown error',
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
    }
  }

  if (hasProperty(error, 'message')) {
    const rawMessage = String(hasProperty(error, 'message') ? (error as { message: unknown }).message : '')
    const name = hasProperty(error, 'name') ? String(error.name) : undefined
    const stack = hasProperty(error, 'stack') ? String(error.stack ?? '') || undefined : undefined
    const diff = hasProperty(error, 'diff') ? String(error.diff ?? '') || undefined : undefined
    const raw = toSerializableRaw(error.raw)
    return {
      message: rawMessage || 'Unknown error',
      ...(name === undefined ? {} : { name }),
      ...(stack === undefined ? {} : { stack }),
      ...(diff === undefined ? {} : { diff }),
      ...(raw === undefined ? {} : { raw }),
    }
  }

  return {
    message: String(error),
  }
}

/** Applies same projection to every lifecycle/assertion error. */
export function serializeTestErrors(errors: unknown[]): HistoireTestError[] {
  return errors.map(serializeTestError)
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[\d*(?:;\d+)*m/g

/** Removes ANSI color escapes — node-side Vitest colorizes diffs for TTYs. */
function stripAnsi(value: string) {
  return value.replace(ANSI_PATTERN, '')
}

/** Renders transported failure text while stripping terminal-only color escapes. */
export function formatTestError(error: HistoireTestError): string {
  if (typeof error === 'string') {
    return stripAnsi(error)
  }

  return [error.message, error.stack, error.diff]
    .filter(Boolean)
    .map(part => stripAnsi(String(part)))
    .join('\n\n')
}
