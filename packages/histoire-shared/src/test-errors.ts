import type { HistoireTestError } from './types/test.js'

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

export function serializeTestError(error: unknown): HistoireTestError {
  if (error instanceof Error) {
    const payload = error as Error & { diff?: unknown, cause?: unknown }
    return {
      name: payload.name || 'Error',
      message: payload.message || error.toString(),
      stack: payload.stack,
      diff: typeof payload.diff === 'string' ? payload.diff : undefined,
      raw: toSerializableRaw(payload.cause),
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
    return {
      name: hasProperty(error, 'name') ? String((error as { name: unknown }).name) : undefined,
      message: rawMessage || 'Unknown error',
      stack: hasProperty(error, 'stack') ? String((error as { stack: unknown }).stack ?? '') || undefined : undefined,
      diff: hasProperty(error, 'diff') ? String((error as { diff: unknown }).diff ?? '') || undefined : undefined,
      raw: toSerializableRaw((error as { raw: unknown }).raw),
    }
  }

  return {
    message: String(error),
  }
}

export function serializeTestErrors(errors: unknown[]): HistoireTestError[] {
  return errors.map(serializeTestError)
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[\d*(?:;\d+)*m/g

/** Removes ANSI color escapes — node-side Vitest colorizes diffs for TTYs. */
function stripAnsi(value: string) {
  return value.replace(ANSI_PATTERN, '')
}

export function formatTestError(error: HistoireTestError): string {
  if (typeof error === 'string') {
    return stripAnsi(error)
  }

  return [error.message, error.stack, error.diff]
    .filter(Boolean)
    .map(part => stripAnsi(String(part)))
    .join('\n\n')
}
