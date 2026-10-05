import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import type { OwnedMount, SessionContext } from './context.js'
import { validateHistoireRuntimeSnapshot, validateWireValue } from '@histoire/protocol'

/** Validate and publish a document once; retired IDs never become current again. */
export function publishRuntime(context: SessionContext, mount: OwnedMount, runtime: HistoireRuntimeSnapshot): boolean {
  validateWireValue(runtime, { kind: 'event', name: 'layout.changed' })
  validateHistoireRuntimeSnapshot(runtime)
  if (!mount.active || runtime.mountId !== mount.handle.id || (runtime.runtimeId && mount.retiredRuntimeIds.has(runtime.runtimeId))) return false
  const replaced = runtime.runtimeId !== null && mount.runtimeId !== null && runtime.runtimeId !== mount.runtimeId
  const retired = mount.runtimeId !== null && (runtime.runtimeId === null || ['stale', 'absent', 'failed'].includes(runtime.status))
  // Retirement rejects pending work immediately, but primary slot remains
  // reserved until mount teardown confirms cleanup. Old readiness cannot revive it.
  if (replaced || retired) mount.retiredRuntimeIds.add(mount.runtimeId!)
  if (retired) mount.runtimeId = null
  else if (runtime.runtimeId !== null) mount.runtimeId = runtime.runtimeId
  if (retired || replaced || (runtime.status === 'mounting' && context.snapshot.runtime.status !== 'mounting')) {
    context.runtimeVersion++
    context.operations.reject('RUNTIME_CHANGED', 'Runtime document changed.', scope => scope.kind === 'runtime')
  }
  const projected = mount.hidden ? { ...runtime, viewports: [], viewport: null } : runtime
  context.publish({ runtime: context.copy(projected), ...(runtime.status === 'mounting' ? { state: null } : {}) })
  return true
}
