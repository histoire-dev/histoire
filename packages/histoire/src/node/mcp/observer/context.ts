import type { UiMcpOperationInfo, UiMcpSnapshot } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { McpRuntimeController } from '../project/dev-facade.js'

/** Dev-only safe MCP observation exposed to the websocket channel. */
export interface DevMcpObserver {
  /** Current listener and bounded activity projections. */
  snapshot: () => UiMcpSnapshot
  /** Snapshot changes for listener policy, restart, and connected clients. */
  onClientChange: (listener: (snapshot: UiMcpSnapshot) => void) => () => void
  /** Upserts for safe operation lifecycle changes. */
  onOperationChange: (listener: (operation: UiMcpOperationInfo) => void) => () => void
  /** Uses existing principal and runtime ownership validation before cancellation. */
  cancelFromUi: (operationId: string) => unknown
}

const observers = new WeakMap<Context, DevMcpObserver>()
const listeners = new WeakMap<Context, Set<(observer?: DevMcpObserver) => void>>()

/** Runtime bridge notifications cannot interrupt generation ownership changes. */
function announce(context: Context, observer?: DevMcpObserver) {
  for (const listener of listeners.get(context) ?? []) {
    try {
      listener(observer)
    }
    catch { /* Channel failures cannot alter runtime lifecycle. */ }
  }
}

/** Bind observation to one context without keeping retired runtime contexts alive. */
export function attachMcpObserver(context: Context, observer: DevMcpObserver) {
  observers.set(context, observer)
  announce(context, observer)
  return () => {
    if (observers.get(context) === observer) {
      observers.delete(context)
      announce(context)
    }
  }
}

/** Read only the observer owned by this exact dev runtime context. */
export function getMcpObserver(context: Context) {
  return observers.get(context)
}

/** Observe late MCP startup on a channel whose Vite server already exists. */
export function onMcpObserverChange(context: Context, listener: (observer?: DevMcpObserver) => void) {
  let subscribers = listeners.get(context)
  if (!subscribers) listeners.set(context, subscribers = new Set())
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
    if (!subscribers.size && listeners.get(context) === subscribers) listeners.delete(context)
  }
}

/** Share exact current-context attachment across dev HTTP and stdio runtimes. */
export function bindMcpObserver(controller: McpRuntimeController, observer: DevMcpObserver, reset: () => void) {
  let context: Context | undefined
  let detach: (() => void) | undefined
  let closed = false
  /** Retire old attachment before publishing a fresh generation snapshot. */
  function synchronize() {
    const handle = controller.current
    const next = handle?.isActive() ? handle.context : undefined
    if (next === context) return
    detach?.()
    context = next
    reset()
    detach = next ? attachMcpObserver(next, observer) : undefined
  }
  const off = controller.subscribe(synchronize)
  synchronize()
  return () => {
    if (closed) return
    closed = true
    off()
    detach?.()
    reset()
  }
}
