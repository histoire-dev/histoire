/** Serialized preference/restart ownership blocks prompt admission before any await. */
export function createAgentControlLane(isClosed: () => boolean) {
  let pending = 0
  let tail = Promise.resolve()
  /** Closed/transitioning managers cannot admit a new lazy process. */
  function assertAdmission(): void {
    if (isClosed()) throw new Error('Agent manager is closed')
    if (pending) throw new Error('Agent settings are changing; wait before sending another prompt')
  }
  return {
    assertAdmission,
    /** Reserve synchronously, then execute one mutation after its predecessor settles. */
    run(operation: () => Promise<void>): Promise<void> {
      if (isClosed()) return Promise.reject(new Error('Agent manager is closed'))
      pending++
      const result = tail.catch(() => {}).then(async () => {
        if (isClosed()) throw new Error('Agent manager is closed')
        await operation()
      })
      tail = result.finally(() => pending--)
      void tail.catch(() => {})
      return tail
    },
    /** Teardown observes every already admitted mutation, including failed persistence. */
    settled: () => tail.catch(() => {}),
  }
}
