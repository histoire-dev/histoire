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
