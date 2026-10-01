/** Polling with a total deadline, shared by the two browser-compatible vi helpers. */
export const STORY_POLLING_CODE = `
/** Polls without overlapping callbacks, retaining each helper's error semantics. */
function pollValue(callback, options, until) {
  const { interval = 50, timeout = 1000 } = typeof options === 'number' ? { timeout: options } : options
  return new Promise((resolve, reject) => {
    let stopped = false
    let retryTimer
    let lastError

    /** Settles once and prevents abandoned callbacks from scheduling more work. */
    function finish(success, value) {
      if (stopped) return
      stopped = true
      clearTimeout(deadlineTimer)
      clearTimeout(retryTimer)
      if (success) resolve(value)
      else reject(value)
    }

    // A separate timer bounds even a callback promise that never settles.
    const deadlineTimer = setTimeout(() => {
      finish(false, lastError || new Error(until ? 'Timed out in waitUntil!' : 'Timed out in waitFor!'))
    }, timeout)

    /** Retries only after the previous callback settled. */
    function retry() {
      if (!stopped) retryTimer = setTimeout(check, interval)
    }

    /** waitFor retries assertions; waitUntil treats any error as final. */
    function onError(error) {
      if (stopped) return
      lastError = error
      if (until) finish(false, error)
      else retry()
    }

    /** Evaluates both synchronous callbacks and promises under the same deadline. */
    function check() {
      if (stopped) return
      try {
        Promise.resolve(callback()).then(value => {
          if (until && !value) retry()
          else finish(true, value)
        }, onError)
      }
      catch (error) {
        onError(error)
      }
    }

    check()
  })
}

/** Retries rejected assertions and returns the first successful value. */
function waitForValue(callback, options = {}) {
  return pollValue(callback, options, false)
}

/** Retries falsy values and rejects callback errors immediately. */
function waitUntilValue(callback, options = {}) {
  return pollValue(callback, options, true)
}
`
