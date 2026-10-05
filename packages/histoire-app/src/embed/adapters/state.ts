import { applySerializedState } from '@histoire/protocol'

/** Runtime state retains local prototypes/callbacks; host receives only cleaned projection. */
export function createRuntimeState(getState: () => Record<string, any>, serialize: (value: any) => Record<string, any>) {
  let baseline: Record<string, any> | undefined
  return {
    /** First actual rendered snapshot is reset baseline; repeated ready cannot replace it. */
    capture() { baseline ??= serialize(getState()) },
    /** Runtime control definitions are derived locally, never editable by host. */
    patch(input: Record<string, unknown>) {
      const patch = Object.fromEntries(Object.entries(input).filter(([key]) => key !== '_hPropDefs'))
      applySerializedState(getState(), patch)
      return serialize(getState())
    },
    /** Reconcile initial projection without replacing state root or omitted live fields. */
    reset() {
      if (!baseline) throw new Error('Runtime baseline unavailable')
      applySerializedState(getState(), baseline, true)
      return serialize(getState())
    },
    /** Snapshot never exposes callbacks/instances as transferable owners. */
    get() { return serialize(getState()) },
  }
}
