import type { HistoireEventSendMessage, HistoireRuntimeFocusMessage, HistoireTarget } from '@histoire/protocol'

/** Attributed event payload before document/version metadata is added by runtime. */
type RuntimeEventMessage = HistoireEventSendMessage & Partial<HistoireTarget>

/** Shared across story/client and vendor module copies, scoped to actual sandbox document. */
interface RuntimeEventScope {
  /** Current collected story owner; no concatenated identity parsing. */
  storyId: () => string | undefined
  /** Installed runtime outbound channel supplies current document and selection ownership. */
  publishEvent?: (message: RuntimeEventMessage) => void
  /** Synchronous actor, usable only while associated native dispatch is active. */
  actor?: HistoireTarget
  /** Native dispatch lifetime; eventPhase is zero outside actual handler dispatch. */
  event?: Event
}
/** Global document key avoids competing actor registries across support bundles. */
const key = '__HST_RUNTIME_EVENT_SCOPE__'
/** Read registry lazily; module import remains SSR-safe. */
function globals() {
  return globalThis as typeof globalThis & { [key]?: RuntimeEventScope }
}

/** Find emitting runtime content cell, not selected grid variant. */
function targetAt(node: unknown, scope: RuntimeEventScope): HistoireTarget | undefined {
  if (typeof Element === 'undefined' || !(node instanceof Element)) return
  const cell = node.closest('[data-histoire-runtime-content]')
  const variantId = cell?.getAttribute('data-histoire-variant-id')
  const storyId = scope.storyId()
  if (storyId && variantId) return { storyId, variantId }
}

/** Exact actor for DOM/synchronous calls; ambiguous object-only async grid calls require explicit target. */
export function resolveRuntimeEventTarget(argument: unknown, explicit?: HistoireTarget): HistoireTarget | undefined {
  if (explicit && typeof explicit.storyId === 'string' && typeof explicit.variantId === 'string') return { storyId: explicit.storyId, variantId: explicit.variantId }
  const scope = globals()[key]
  if (!scope) return
  const node = argument && typeof argument === 'object' && 'target' in argument ? argument.target : undefined
  const target = targetAt(node, scope) ?? (scope.event?.eventPhase ? scope.actor : undefined)
  if (target) return target
  // Single visible runtime has one attributable actor, including delayed callbacks.
  // Multiple grid cells are deliberately ambiguous rather than attributed to selection.
  const cells = document.querySelectorAll('[data-histoire-runtime-content]')
  if (cells.length === 1) return targetAt(cells[0], scope)
}

/** Publish through document-owned runtime channel, shared across story/client module copies. */
export function publishRuntimeEvent(message: RuntimeEventMessage): boolean {
  const publish = globals()[key]?.publishEvent
  if (!publish) return false
  publish(message)
  return true
}

/** Capture actor before framework handlers; no Promise/timer monkey patches or async ambient ownership. */
export function installRuntimeEventScope(storyId: () => string | undefined, publishFocus?: (focused: boolean, action?: HistoireRuntimeFocusMessage['action']) => void, publishEvent?: (message: RuntimeEventMessage) => void): () => void {
  const scope: RuntimeEventScope = { storyId, publishEvent }
  globals()[key] = scope
  const types = ['click', 'dblclick', 'input', 'change', 'submit', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'focusin', 'focusout']
  /**
   * Native browsers may flush microtasks between capture/target listeners.
   * Retain at most one event and consult its dispatch phase rather than clearing
   * too early or keeping an actor alive across a Promise/timer continuation.
   */
  function capture(event: Event) {
    const actor = targetAt(event.composedPath()[0], scope)
    scope.actor = actor
    scope.event = event
  }
  /** Finite host intents yield to story handlers before leaving the owned iframe. */
  function keydown(event: KeyboardEvent) {
    if (!publishFocus || event.defaultPrevented || event.altKey) return
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat) {
      // Only the host knows whether chrome is hidden; leave native Escape unconsumed.
      publishFocus(true, 'show-ui')
      return
    }
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const action = event.shiftKey && key === 'h' ? 'toggle-ui' : key === 'k' ? 'search' : undefined
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    publishFocus(true, action)
  }
  const focus = () => publishFocus?.(true)
  const blur = () => publishFocus?.(false)
  window.addEventListener('keydown', keydown)
  window.addEventListener('focus', focus)
  window.addEventListener('blur', blur)
  for (const type of types) document.addEventListener(type, capture, true)
  return () => {
    for (const type of types) document.removeEventListener(type, capture, true)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('focus', focus)
    window.removeEventListener('blur', blur)
    scope.actor = undefined
    scope.event = undefined
    if (globals()[key] === scope) delete globals()[key]
  }
}
