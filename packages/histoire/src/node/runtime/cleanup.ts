/** Resource disposer registered immediately after acquisition. */
export type RuntimeCleanup = () => void | Promise<void>

/** Teardown failed or timed out; project ownership cannot be safely transferred. */
export class RuntimeCleanupError extends AggregateError {
  /** Stable marker survives duplicate module instances and worker serialization. */
  readonly code = 'HISTOIRE_RUNTIME_CLEANUP_FAILED'
  /** Preserves original failures while marking unconfirmed resource release. */
  constructor(errors: unknown[], message: string) {
    super(errors, message)
    this.name = 'RuntimeCleanupError'
  }
}

/** Finds unconfirmed teardown even when startup preserved it in an aggregate. */
export function hasUnconfirmedCleanup(error: unknown): boolean {
  return error instanceof RuntimeCleanupError
    || (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'HISTOIRE_RUNTIME_CLEANUP_FAILED' || error.code === 'CLEANUP_UNCONFIRMED'))
    || (error instanceof AggregateError && error.errors.some(hasUnconfirmedCleanup))
}

/** Bounds owned resource teardown without leaving an unobserved rejection. */
export async function withCleanupDeadline<T>(promise: Promise<T>, timeout = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RuntimeCleanupError([], 'Project runtime cleanup timed out')), timeout)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}

/** Closes every acquired resource in reverse dependency order, including after failures. */
export function createCleanupStack() {
  const cleanups: RuntimeCleanup[] = []
  let closing: Promise<void> | undefined
  return {
    /** Registers an owned resource while acquisition is still active. */
    add(cleanup: RuntimeCleanup) {
      if (closing) {
        throw new Error('Cannot acquire resource after runtime cleanup started')
      }
      cleanups.push(cleanup)
    },
    /** Invokes disposers once; all attempts occur even when a disposer throws. */
    close() {
      return closing ??= (async () => {
        const deadline = Date.now() + 10_000
        const errors: unknown[] = []
        for (const cleanup of cleanups.splice(0).reverse()) {
          // Plugin cleanup may still need Vite. Await each disposer before
          // releasing earlier-acquired resources, while bounding total teardown.
          try {
            await withCleanupDeadline(Promise.resolve().then(cleanup), Math.max(1, deadline - Date.now()))
          }
          catch (error) {
            errors.push(error)
          }
        }
        if (errors.length) {
          throw new RuntimeCleanupError(errors, errors.map(error => String(error)).join('; '))
        }
      })()
    },
  }
}
