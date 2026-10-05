/** Nuxt/unctx default lookup used only during explicit setup or synchronous callback. */
interface NuxtContext {
  /** Current default fallback, possibly absent. */
  tryUse: () => unknown
  /** Replace temporary owner without singleton conflict. */
  set: (value: unknown, replace?: boolean) => void
  /** Remove absent fallback. */
  unset: () => void
}

/** Serialize asynchronous initialization instead of retaining competing global fallback owners. */
export function createNuxtSetupContext(context: NuxtContext) {
  let tail = Promise.resolve()
  /** Restore only our captured synchronous/setup scope, never later arbitrary promise completion. */
  function restore(owner: unknown, previous: unknown) {
    if (context.tryUse() !== owner) return
    if (previous) context.set(previous, true)
    else context.unset()
  }
  return {
    /** Nuxt component injection remains authoritative; default fallback covers current synchronous call. */
    call<T>(owner: unknown, callback: () => T): T {
      const previous = context.tryUse()
      context.set(owner, true)
      try {
        return callback()
      }
      finally {
        restore(owner, previous)
      }
    },
    /** Plugin/user/variant setup owns default context until complete, with FIFO isolation and cleanup. */
    setup<T>(owner: unknown, callback: () => T | Promise<T>): Promise<T> {
      const result = tail.then(async () => {
        const previous = context.tryUse()
        context.set(owner, true)
        try {
          return await callback()
        }
        finally {
          restore(owner, previous)
        }
      })
      tail = result.then(() => {}, () => {})
      return result
    },
  }
}
