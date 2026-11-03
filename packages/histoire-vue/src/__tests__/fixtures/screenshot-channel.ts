import type { ScreenshotSetupSnapshot } from '@histoire/shared'
import { vi } from 'vitest'
import { nextTick } from 'vue'

/** Shared external screenshot-service double; application controllers remain real. */
export const screenshotChannel = {
  /** Active subscriptions owned by mounted consumers. */
  listeners: new Map<string, Set<(value: unknown) => void>>(),
  /** Socket-disconnect subscriptions owned by mounted consumers. */
  disconnect: new Set<() => void>(),
  /** Reply immediately for toolbar tests unrelated to setup orchestration. */
  autoReady: false,
  /** Record outgoing requests, optionally holding server replies. */
  send: vi.fn((_event: string, _payload: unknown) => true),
}

/** Return a fresh portable setup response for a specific user-visible state. */
export function setupSnapshot(overrides: Partial<ScreenshotSetupSnapshot> = {}): ScreenshotSetupSnapshot {
  const snapshot: ScreenshotSetupSnapshot = {
    revision: 1,
    state: 'needs-action',
    reason: 'driver-missing',
    attempts: [],
    repairs: [{ id: 'install-playwright', label: 'Add Playwright', command: { executable: 'pnpm', args: ['add', '-D', 'playwright'] } }],
    ...overrides,
  }
  if (Object.hasOwn(overrides, 'reason') && overrides.reason === undefined) delete snapshot.reason
  return snapshot
}

/** Deliver a server message through currently registered transport listeners. */
export async function emitScreenshotResult(event: string, value: unknown): Promise<void> {
  for (const listener of [...(screenshotChannel.listeners.get(event) ?? [])]) listener(value)
  await nextTick()
}

/** Inspect exact setup requests admitted by the external transport. */
export function setupRequests(): { requestId: string, action: string }[] {
  return screenshotChannel.send.mock.calls
    .filter(([event]) => event === 'histoire:ui:screenshot-setup')
    .map(([, payload]) => payload as { requestId: string, action: string })
}

/** Reset only test-owned service state after consumers have unmounted. */
export function resetScreenshotChannel(): void {
  screenshotChannel.listeners.clear()
  screenshotChannel.disconnect.clear()
  screenshotChannel.autoReady = false
  screenshotChannel.send.mockReset()
  screenshotChannel.send.mockReturnValue(true)
}

/** Module replacement stays at the external development-channel boundary. */
export const screenshotTransport = {
  /** Admit a request and optionally complete setup without a real browser. */
  sendUiEvent(event: string, payload: Record<string, unknown>): boolean {
    const accepted = screenshotChannel.send(event, payload)
    if (accepted && screenshotChannel.autoReady && event === 'histoire:ui:screenshot-setup' && payload.action === 'check') {
      void emitScreenshotResult('histoire:ui:screenshot-setup-result', {
        requestId: payload.requestId,
        setup: setupSnapshot({ state: 'ready', reason: undefined, source: 'chrome', repairs: [] }),
      })
    }
    return accepted
  },
  /** Register a service reply listener for the consumer lifetime. */
  onUiEvent(event: string, listener: (value: unknown) => void): () => void {
    const listeners = screenshotChannel.listeners.get(event) ?? new Set()
    listeners.add(listener)
    screenshotChannel.listeners.set(event, listeners)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Register simulated socket loss for the consumer lifetime. */
  onUiDisconnect(listener: () => void): () => void {
    screenshotChannel.disconnect.add(listener)
    return () => {
      screenshotChannel.disconnect.delete(listener)
    }
  },
}
