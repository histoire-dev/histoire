import type { TerminalBridgeEvent } from '../terminal/bridge.js'
import type { TestOperationDto } from '../terminal/protocol/tests.js'
import { vi } from 'vitest'
import { createProgressState } from '../terminal/progress/state.js'
import { createTestTargetHandoff } from '../terminal/stories/handoff.js'
import { createTestsConsole } from '../terminal/tests/console.js'
import { createTestsState } from '../terminal/tests/state.js'
import { readyGeneration } from './utils/terminal/progress.js'

/** Snapshot with only the fields the console reads. */
export function operation(id: string, state: TestOperationDto['state'], extra: Partial<TestOperationDto> = {}): TestOperationDto {
  return { id, state, target: { scope: 'all' }, epoch: 'e', revision: 'rev1', cancelRequested: false, queuedAt: 1, ...extra }
}

/**
 * Real console, state and handoff over a scripted `tests.*` boundary (the child) and the
 * real progress mirror for generations.
 */
export function createRig() {
  const progress = createProgressState()
  const start = (generation: string) => readyGeneration(progress, generation)
  start('g1')
  const listeners = new Set<(event: TerminalBridgeEvent) => void>()
  const admitted: unknown[] = []
  const cancelled: string[] = []
  const child = { run: vi.fn(async (target: unknown) => {
    admitted.push(target)
    return operation(`op${admitted.length}`, 'queued', { target: target as TestOperationDto['target'] })
  }), cancel: vi.fn(async (id: string) => {
    cancelled.push(id)
    return operation(id, 'cancelling', { cancelRequested: true })
  }) }
  const client = { ...child, get: async () => operation('x', 'queued'), results: async () => ({ operationId: 'x', cases: [], total: 0 }) }
  const state = createTestsState({ client })
  const handoff = createTestTargetHandoff()
  const bridge = { subscribe: (listener: (event: TerminalBridgeEvent) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  } }
  state.attach(bridge)
  const tests = createTestsConsole({ state, client, bridge, progress, handoff })
  return {
    tests,
    progress,
    bridge,
    state,
    handoff,
    child,
    admitted,
    cancelled,
    start,
    /** Child event for a generation. */
    emit: (event: string, data: unknown, generation = 'g1') => listeners.forEach(listener => listener({ generation, event, data } as TerminalBridgeEvent)),
    select: (target: NonNullable<ReturnType<typeof handoff.current>>['target'], generation = 'g1') => handoff.set({ target, label: 'B / two', storyLabel: 'B', revision: 'rev1', generation }),
  }
}
