import type { CaptureBrowserLease } from './types.js'

/** Builds an idempotent lease and reports any cleanup that cannot be confirmed. */
export function createCaptureBrowserLease(options: {
  /** Browser held until the caller has finished its capture. */
  browser: CaptureBrowserLease['browser']
  /** Candidate source that created the browser. */
  source: CaptureBrowserLease['source']
  /** Returns a healthy pooled browser after operation cleanup succeeds. */
  releaseBrowser: () => Promise<unknown>
  /** Closes a pooled browser when operation cleanup is uncertain. */
  discardBrowser?: () => Promise<unknown>
  /** Retains terminal cleanup failure in the owning setup manager. */
  retainCleanupFailure: (error: unknown) => unknown
  /** Clears the owner’s active lease after confirmed cleanup. */
  onReleased: (release: () => Promise<void>) => void
}): CaptureBrowserLease {
  let releasing: Promise<void> | undefined
  /** Shares one terminal outcome when release, discard, and owner close race. */
  function finish(action: () => Promise<unknown>): Promise<void> {
    return releasing ??= (async () => {
      try {
        await action()
      }
      catch (error) {
        throw options.retainCleanupFailure(error)
      }
      options.onReleased(release)
    })()
  }

  /** Returns a confirmed healthy browser to its idle process pool. */
  function release(): Promise<void> {
    return finish(options.releaseBrowser)
  }

  /** Destroys the exact process after context or browser API cleanup uncertainty. */
  function discard(): Promise<void> {
    return finish(options.discardBrowser ?? options.releaseBrowser)
  }

  return { browser: options.browser, source: options.source, release, discard }
}
