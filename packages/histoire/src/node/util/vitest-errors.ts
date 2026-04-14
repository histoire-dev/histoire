/**
 * Minimal Vitest shape used for reporting unhandled browser-run errors without
 * coupling this helper to Vitest's concrete class types.
 */
interface VitestLike {
  state: {
    getUnhandledErrors?: () => unknown[]
  }
}

/**
 * Extracts a readable error message from a Vitest error payload.
 */
export function formatVitestError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/**
 * Returns all unhandled Vitest errors as printable strings.
 */
export function getUnhandledVitestErrors(vitest: VitestLike): string[] {
  return (vitest.state.getUnhandledErrors?.() ?? []).map(formatVitestError)
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
