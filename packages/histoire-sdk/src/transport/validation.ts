import type { HistoireBridgeCommand, HistoireSourceDescriptor } from '@histoire/protocol'
/** Shared control budget; runtime execution retains its established deadline. */
export const HISTOIRE_CONTROL_TIMEOUT = 15000
/** Selects deadline from source execution budgets, never generic connection budget. */
export function getBridgeRequestTimeout(command: HistoireBridgeCommand, payload: unknown, descriptor?: HistoireSourceDescriptor): number {
  const mode = (payload as { mode?: string }).mode
  if (['view.sync', 'selection.select', 'state.get', 'state.patch', 'state.reset', 'tests.collect'].includes(command) || (command === 'source.get' && mode === 'dynamic')) {
    return (descriptor?.config?.storyCollectTimeout ?? 30000) + HISTOIRE_CONTROL_TIMEOUT
  }
  if (command !== 'tests.run') {
    return HISTOIRE_CONTROL_TIMEOUT
  }
  const budget = descriptor?.config?.runTimeout ?? 300000
  return ((payload as {
    mode?: string
  }).mode === 'server'
    ? Math.max(360000, budget)
    : budget) + HISTOIRE_CONTROL_TIMEOUT
}
/** Port authority derives from requested first-party surface, never message hints. */
export function getBridgeSurfaceRole(surface: string): 'primary' | 'controls' | 'view' {
  return ['explorer', 'preview', 'grid'].includes(surface) ? 'primary' : surface === 'controls' ? 'controls' : 'view'
}
