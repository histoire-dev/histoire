import type { UiVisualCase } from '@histoire/shared'
import type { createVisualTransport } from './visual-transport.js'

/** Coalesce startup/reconnect refreshes within same runtime generation. */
export function createVisualRefresh(operation: () => Promise<void>, generation: () => number) {
  const pending = new Map<number, Promise<void>>()
  return () => {
    const token = generation()
    const existing = pending.get(token)
    if (existing) return existing
    const promise = operation().finally(() => pending.delete(token))
    pending.set(token, promise)
    return promise
  }
}

/** Resolve complete compact inventory while dropping replies owned by retired source. */
export async function loadVisualInventory(transport: ReturnType<typeof createVisualTransport>, isActive: () => boolean) {
  const cases: UiVisualCase[] = []
  let offset: number | undefined = 0
  let inventory: { profiles: { id: string }[], baselineRef: string } | undefined
  do {
    const reply = await transport.request({ action: 'inventory', offset })
    if (!isActive()) return
    if (!reply.inventory) throw new Error('Visual inventory unavailable')
    cases.push(...reply.inventory.cases)
    inventory = reply.inventory
    offset = reply.inventory.nextOffset
  } while (offset !== undefined)
  return { cases, profiles: inventory!.profiles, baselineRef: inventory!.baselineRef }
}
