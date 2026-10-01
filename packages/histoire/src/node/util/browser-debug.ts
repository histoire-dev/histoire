/**
 * Prints browser-runtime diagnostics, but only when `HST_DEBUG_BROWSER` is set.
 *
 * The browser collection and test runs are opaque when they hang or crash, so
 * every phase logs through this single opt-in channel.
 * @param args Values to print after the `[histoire:browser]` prefix.
 */
export function debugVitestBrowser(...args: unknown[]) {
  if (process.env.HST_DEBUG_BROWSER) {
    console.log('[histoire:browser]', ...args)
  }
}
