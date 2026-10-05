import type { HistoireBridgeCommand } from './types.js'
import { validateHostChannelPayload } from '../channels.js'
import { validateHistoireSnapshot } from './snapshot.js'
import { HISTOIRE_BRIDGE_EVENTS } from './types.js'
import { invalid, validateHistoireTarget, validateSettingsPatch, wireId, wireRecord } from './validation.js'

/** Validates finite command arguments; transport signals never cross wire. */
export function validateBridgePayload(command: HistoireBridgeCommand, value: unknown): void {
  const input = wireRecord(value)
  const fields: Partial<Record<HistoireBridgeCommand, readonly string[]>> = {
    'catalog.list': [],
    'catalog.getStory': ['storyId'],
    'catalog.search': ['query'],
    'selection.select': ['storyId', 'variantId'],
    'state.get': [],
    'state.reset': [],
    'events.clear': [],
    'docs.get': ['storyId'],
    'source.get': ['storyId', 'variantId', 'mode'],
    'tests.collect': [],
    'tests.run': ['mode'],
    'tests.cancel': ['requestId'],
    'openInEditor': ['storyId', 'variantId'],
    'subscriptions.add': ['subscriptionId', 'streams'],
    'subscriptions.remove': ['subscriptionId'],
    'channel.post': ['name', 'type', 'data'],
    'controls.configure': ['customOnly'],
    'controls.preset': ['action', 'id', 'label'],
  }
  const allowed = fields[command]
  if (allowed && Object.keys(input).some(key => !allowed.includes(key))) invalid('Unknown command argument')
  if (['catalog.getStory', 'docs.get'].includes(command) && !wireId(input.storyId)) invalid('Expected story ID')
  if (command === 'catalog.search' && typeof input.query !== 'string') invalid('Expected search query')
  if (command === 'selection.select') validateHistoireTarget(input, true)
  if (command === 'state.patch') {
    if (Object.hasOwn(input, '_hPropDefs')) invalid('Derived controls metadata is runtime-owned')
  }
  if (command === 'settings.update') validateSettingsPatch(input)
  if (command === 'source.get') {
    if (!wireId(input.storyId) || (input.variantId !== undefined && !wireId(input.variantId)) || !['raw', 'dynamic'].includes(input.mode as string)) invalid('Invalid source request')
  }
  if (command === 'tests.run' && !['preview', 'server'].includes(input.mode as string)) invalid('Explicit test execution mode required')
  if (command === 'tests.cancel' && !wireId(input.requestId)) invalid('Exact test request identity required')
  if (command === 'openInEditor') validateHistoireTarget(input)
  if (command.startsWith('subscriptions.')) {
    if (!wireId(input.subscriptionId)) invalid('Expected subscription identity')
    if (command === 'subscriptions.add' && (!Array.isArray(input.streams) || input.streams.some(stream => !HISTOIRE_BRIDGE_EVENTS.includes(stream)))) invalid('Invalid subscription stream')
  }
  if (command === 'channel.post') validateHostChannelPayload(input)
  if (command === 'view.sync') validateHistoireSnapshot(value)
  if (command === 'controls.configure' && typeof input.customOnly !== 'boolean') invalid('Controls presentation must be boolean')
  if (command === 'controls.preset') {
    if (!['list', 'save', 'apply', 'delete', 'rename'].includes(input.action as string)) invalid('Invalid preset action')
    const id = ['apply', 'delete', 'rename'].includes(input.action as string)
    const label = ['save', 'rename'].includes(input.action as string)
    if (id ? !wireId(input.id) : input.id !== undefined) invalid('Invalid preset identity')
    if (label ? typeof input.label !== 'string' || !input.label.trim() || input.label.length > 120 : input.label !== undefined) invalid('Invalid preset label')
  }
}
