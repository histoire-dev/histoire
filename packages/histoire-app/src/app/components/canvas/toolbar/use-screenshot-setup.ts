import type { ScreenshotSetupSnapshot, UiChannelError } from '@histoire/shared'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { onUiDisconnect, onUiEvent, sendUiEvent } from '../../../util/ui-channel.js'

type ScreenshotSetupAction = 'read' | 'check' | 'refresh'

interface ActiveRequest {
  /** Correlation identity echoed by the server result. */
  requestId: string
  /** Operation owned by this setup panel. */
  action: ScreenshotSetupAction
  /** Local generation captured when this operation starts. */
  generation: number
  /** Start one explicit check after discovery refresh succeeds. */
  checkAfterRefresh: boolean
}

interface QueuedAction {
  /** Explicit operation to start after an active metadata read succeeds. */
  action: 'check' | 'refresh'
  /** Continue from refresh into an explicit browser check. */
  checkAfterRefresh: boolean
}

/** Public state and actions shared with the screenshot setup panel. */
export interface ScreenshotSetupController {
  /** Latest portable setup observation. */
  snapshot: ShallowRef<ScreenshotSetupSnapshot | null>
  /** Latest transport or owned-check error. */
  error: ShallowRef<UiChannelError | null>
  /** Whether an explicit setup probe or refresh is in progress. */
  checking: ComputedRef<boolean>
  /** Whether first metadata read is still pending. */
  reading: ComputedRef<boolean>
  /** Whether a user or capture has completed a real setup check. */
  checked: Ref<boolean>
  /** Read public setup metadata. */
  read: () => void
  /** Probe the discovered browser without invalidating driver metadata. */
  checkSetup: () => void
  /** Refresh external installation metadata, then check. */
  checkAgain: () => void
  /** Adopt setup reported by capture without probing again. */
  acceptCaptureSetup: (value: ScreenshotSetupSnapshot | null) => void
}

/** Owns one browser's setup reads and explicit checks for this component lifetime. */
export function useScreenshotSetup(): ScreenshotSetupController {
  /** Latest portable setup observation. */
  const snapshot = shallowRef<ScreenshotSetupSnapshot | null>(null)
  /** Latest transport or owned-check error. */
  const error = shallowRef<UiChannelError | null>(null)
  /** Current correlated operation owned by this composable instance. */
  const active = shallowRef<ActiveRequest | null>(null)
  /** One explicit user action waiting for the current metadata read. */
  const queuedAction = shallowRef<QueuedAction | null>(null)
  /** Whether a user or capture has completed a real setup check. */
  const checked = ref(false)
  /** Local lifecycle generation used to reject late server replies. */
  const generation = ref(0)
  /** Terminal lifecycle marker for callbacks already queued by the transport. */
  const disposed = ref(false)
  /** Highest setup revision observed within the active server generation. */
  let highestRevision = 0
  /** Whether an explicit setup probe or refresh is in progress. */
  const checking = computed(() => active.value?.action === 'check' || active.value?.action === 'refresh' || queuedAction.value !== null)
  /** Whether first metadata read is still pending. */
  const reading = computed(() => active.value?.action === 'read' && !snapshot.value)

  /** Create a browser-local correlation identity for one setup request. */
  function identity(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  /** Stop only this component's currently owned explicit browser check. */
  function cancelOwnedCheck(): void {
    if (active.value?.action === 'check') {
      sendUiEvent('histoire:ui:screenshot-setup-cancel', { requestId: active.value.requestId })
    }
    generation.value++
    active.value = null
    queuedAction.value = null
  }

  /** Start one bounded setup event and reject stale replies by identity and generation. */
  function request(action: ScreenshotSetupAction, checkAfterRefresh = false): void {
    if (disposed.value) return
    if (active.value) {
      if (active.value.action === 'read' && (action === 'check' || action === 'refresh')) {
        queuedAction.value = { action, checkAfterRefresh }
        error.value = null
      }
      return
    }
    const requestId = identity()
    const currentGeneration = generation.value
    active.value = { requestId, action, generation: currentGeneration, checkAfterRefresh }
    error.value = null
    try {
      if (!sendUiEvent('histoire:ui:screenshot-setup', { requestId, action })) {
        active.value = null
        error.value = { code: 'unavailable', message: 'Screenshot setup service unavailable' }
      }
    }
    catch {
      active.value = null
      error.value = { code: 'invalid', message: 'Screenshot setup request is too large' }
    }
  }

  /** Read public setup metadata when the setup panel opens. */
  function read(): void {
    request('read')
  }

  /** Probe the discovered browser without invalidating driver metadata. */
  function checkSetup(): void {
    request('check')
  }

  /** Refresh external installation metadata, then check only after refresh replies. */
  function checkAgain(): void {
    request('refresh', true)
  }

  /** Ignore an older capture or server observation from this runtime generation. */
  function publishSnapshot(value: ScreenshotSetupSnapshot): boolean {
    if (value.revision < highestRevision) return false
    highestRevision = value.revision
    snapshot.value = value
    return true
  }

  /** Adopt setup reported by capture without starting another browser operation. */
  function acceptCaptureSetup(value: ScreenshotSetupSnapshot | null): void {
    if (!value) return
    if (!publishSnapshot(value)) return
    checked.value = true
    error.value = null
  }

  const disposeResult = onUiEvent('histoire:ui:screenshot-setup-result', (result) => {
    const ticket = active.value
    if (disposed.value || !ticket || result.requestId !== ticket.requestId || ticket.generation !== generation.value) return
    active.value = null
    if ('error' in result) {
      if (ticket.action === 'check') checked.value = true
      queuedAction.value = null
      error.value = result.error
      if (result.error.setup) publishSnapshot(result.error.setup)
      return
    }
    publishSnapshot(result.setup)
    if (ticket.action === 'check') checked.value = true
    if (ticket.checkAfterRefresh) {
      request('check')
    }
    else if (ticket.action === 'read' && queuedAction.value) {
      const queued = queuedAction.value
      queuedAction.value = null
      request(queued.action, queued.checkAfterRefresh)
    }
  })

  const disposeDisconnect = onUiDisconnect(() => {
    cancelOwnedCheck()
    highestRevision = 0
    snapshot.value = null
    checked.value = false
    error.value = { code: 'unavailable', message: 'Screenshot setup service unavailable' }
  })

  /** Release this browser's explicit check and transport listeners at teardown. */
  onBeforeUnmount(() => {
    disposed.value = true
    cancelOwnedCheck()
    disposeResult()
    disposeDisconnect()
  })

  return { snapshot, error, checking, reading, checked, read, checkSetup, checkAgain, acceptCaptureSetup }
}
