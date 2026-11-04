/**
 * Drains the microtask queue without advancing any (fake) clock.
 *
 * Anything the code under test does after a flush provably did not wait on a
 * timer — which is what lets the request/queue specs prove a promise settled on
 * its own rather than by timing out.
 * @param ticks How many microtask turns to drain.
 */
export async function flushMicrotasks(ticks = 10) {
  for (let tick = 0; tick < ticks; tick++) {
    await Promise.resolve()
  }
}

/**
 * Lets pending fire-and-forget promises and zero-delay timers run on a real clock.
 * @param ms Delay before resolving.
 */
export function settleTimers(ms = 0) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
