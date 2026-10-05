import type { HistoireBridgeCommand, HistoireBridgeIdentity } from '@histoire/protocol'
import type { HistoireSession } from '../types.js'
import { HistoireSdkError, validateHistoireStateSnapshot } from '@histoire/protocol'
import { requestHistoireOpenInEditor, requestHistoireStatePreset } from '../session/internal.js'

/** Wire mutations acknowledge actual canonical state while public SDK methods stay void. */
async function mutateViewState(session: HistoireSession, command: 'state.patch' | 'state.reset', input: unknown) {
  const captured = session.getSnapshot()
  /** Navigation/source replacement between mutation and read cannot acknowledge replacement. */
  function assertCurrent(): void {
    const current = session.getSnapshot()
    if (current.source?.sourceId !== captured.source?.sourceId || current.source?.epoch !== captured.source?.epoch || current.source?.revision !== captured.source?.revision) {
      throw new HistoireSdkError('STALE_REVISION', 'State acknowledgment belongs to another source revision')
    }
    if (current.runtime.runtimeId !== captured.runtime.runtimeId || current.selection?.storyId !== captured.selection?.storyId || current.selection?.variantId !== captured.selection?.variantId) {
      throw new HistoireSdkError('RUNTIME_CHANGED', 'State acknowledgment belongs to another runtime')
    }
  }
  if (command === 'state.patch') await session.state.patch(input as Record<string, unknown>)
  else await session.state.reset()
  assertCurrent()
  const state = await session.state.get()
  assertCurrent()
  validateHistoireStateSnapshot(state)
  return state
}
/** Finite view intent dispatch into local parent controller; no second controller or plugin tunnel. */
export function dispatchHistoireSessionCommand(session: HistoireSession, command: HistoireBridgeCommand, value: unknown, capture?: HistoireBridgeIdentity, signal?: AbortSignal): Promise<unknown> | unknown {
  const input = value as any
  if (capture) {
    const snapshot = session.getSnapshot()
    if (capture.sourceId !== snapshot.source?.sourceId || capture.epoch !== snapshot.source.epoch || capture.revision !== snapshot.source.revision) {
      throw new HistoireSdkError('STALE_REVISION', 'View intent belongs to another source revision')
    }
    const runtime = ['state.get', 'state.patch', 'state.reset', 'controls.preset', 'tests.collect', 'channel.post'].includes(command) || (command === 'source.get' && input.mode === 'dynamic') || (command === 'tests.run' && input.mode === 'preview')
    if (runtime || command === 'tests.run') {
      if (capture.target?.storyId !== snapshot.selection?.storyId || capture.target?.variantId !== snapshot.selection?.variantId || (runtime && capture.runtimeId !== (snapshot.runtime.runtimeId ?? undefined))) {
        throw new HistoireSdkError('RUNTIME_CHANGED', 'View intent belongs to another target or runtime')
      }
    }
  }
  switch (command) {
    case 'catalog.list': return session.catalog.list()
    case 'catalog.getStory': return session.catalog.getStory(input.storyId)
    case 'catalog.search': return session.catalog.search(input.query)
    case 'selection.select': return session.selection.select(input)
    case 'state.get': return session.state.get()
    case 'state.patch': return mutateViewState(session, command, input)
    case 'state.reset': return mutateViewState(session, command, input)
    case 'controls.preset': return requestHistoireStatePreset(session, input)
    case 'openInEditor': return requestHistoireOpenInEditor(session, input)
    case 'settings.update': return session.settings.update(input)
    case 'events.clear': return session.events.clear()
    case 'docs.get': return session.docs.get(input.storyId)
    case 'source.get': return session.source.get(input)
    case 'tests.collect': return session.tests.collect()
    case 'tests.run': return session.tests.run({ mode: input.mode, signal })
    case 'channel.post': return session.channels.open(input.name).post(input.type, input.data).then(() => null)
    default: throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', 'View intent unavailable')
  }
}
