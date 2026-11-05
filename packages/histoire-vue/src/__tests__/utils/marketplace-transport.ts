import type { MarketplaceTransport } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import type { UiClientEvents, UiServerEvents } from '../../../../histoire-shared/src/index.js'
import { vi } from 'vitest'
import { nextTick } from 'vue'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'

/** Let Vue capture inputs, then cross the catalog's public 150 ms debounce boundary. */
export async function flushCatalog(): Promise<void> {
  await nextTick()
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(150)
  else await new Promise(resolve => setTimeout(resolve, 150))
}

/** In-memory external UI channel; real marketplace client owns correlation. */
export function createMarketplaceTransport() {
  const listeners = new Map<keyof UiServerEvents, Set<(value: any) => void>>()
  const sent: Array<{ event: keyof UiClientEvents, value: any }> = []
  const transport: MarketplaceTransport = {
    available: () => true,
    send(event, value) {
      sent.push({ event, value: JSON.parse(JSON.stringify(value)) })
      return true
    },
    on(event, listener) {
      const group = listeners.get(event) ?? new Set()
      listeners.set(event, group)
      group.add(listener)
      return () => {
        group.delete(listener)
      }
    },
  }
  return {
    transport,
    sent,
    /** Deliver a server event, including private correlated replies. */
    emit<K extends keyof UiServerEvents>(event: K, value: UiServerEvents[K]): void {
      for (const listener of [...listeners.get(event) ?? []]) listener(value)
    },
    /** Observe cleanup without substituting the client lifecycle. */
    listenerCount(): number {
      return [...listeners.values()].reduce((sum, group) => sum + group.size, 0)
    },
  }
}

/** Isolate browser recovery receipts while retaining storage across fresh store owners. */
export function stubMarketplaceSession(): void {
  vi.stubGlobal('sessionStorage', memoryStorage())
}
