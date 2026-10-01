/**
 * Minimal Vitest shape used for reporting unhandled browser-run errors without
 * coupling these helpers to Vitest's concrete class types.
 */
export interface VitestLike {
  state?: {
    getUnhandledErrors?: () => unknown[]
  }
}

/**
 * Extracts a readable error message from a Vitest error payload.
 *
 * Errors coming back from the browser are serialized plain objects, not `Error`
 * instances: their stack is kept too, since it often carries the only mention of
 * what actually broke (a nested cause, the failing module…).
 */
export function formatVitestError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  if (typeof error === 'object' && error) {
    const { stack, message } = error as { stack?: unknown, message?: unknown }
    if (typeof stack === 'string' && stack) {
      return stack
    }
    if (message !== undefined) {
      return String(message)
    }
  }
  return String(error)
}

/**
 * Returns all unhandled Vitest errors as printable strings.
 */
export function getUnhandledVitestErrors(vitest: VitestLike): string[] {
  return (vitest.state?.getUnhandledErrors?.() ?? []).map(formatVitestError)
}

/**
 * Throws when the Vitest run reported unhandled errors outside individual test
 * results, such as import/setup crashes in the browser runtime.
 */
export function assertVitestRunHasNoUnhandledErrors(vitest: VitestLike) {
  const errors = getUnhandledVitestErrors(vitest)
  if (errors.length) {
    throw new Error(errors.join('\n\n'))
  }
}
