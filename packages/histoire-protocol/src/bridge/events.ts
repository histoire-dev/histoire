import type { HistoireBridgeEvent } from './types.js'
import { validateHostChannelPayload } from '../channels.js'
import { validateHistoireSourceDescriptor } from './catalog.js'
import { validateHistoireErrorData, validateHistoireTestResult } from './results.js'
import { validateHistoireEvent, validateHistoireRuntimeSnapshot, validateHistoireStateSnapshot, validateHistoireViewports } from './snapshot.js'
import { invalid, validateHistoireTarget, validateSettingsPatch, wireId, wireRecord } from './validation.js'

/** Finite controls schemas carry presentation only, never arbitrary runtime values. */
function fields(input: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(input).some(key => !allowed.includes(key))) invalid('Unknown controls event field')
}

/** Finite overlay labels/IDs/rectangles; values and callbacks stay runtime-local. */
function validateOverlay(input: Record<string, unknown>, closing: boolean): void {
  fields(input, closing ? ['id'] : ['id', 'anchor', 'overlay'])
  if (!wireId(input.id)) invalid('Invalid overlay identity')
  if (closing) return
  const anchor = wireRecord(input.anchor)
  fields(anchor, ['x', 'y', 'width', 'height'])
  for (const key of ['x', 'y', 'width', 'height']) {
    if (typeof anchor[key] !== 'number' || !Number.isFinite(anchor[key]) || (['width', 'height'].includes(key) && (anchor[key] as number) < 0)) invalid('Invalid overlay anchor')
  }
  const overlay = wireRecord(input.overlay)
  if (overlay.kind === 'select') {
    fields(overlay, ['kind', 'items', 'label', 'selectedId'])
    if (!Array.isArray(overlay.items) || (overlay.label !== undefined && typeof overlay.label !== 'string') || (overlay.selectedId !== undefined && !wireId(overlay.selectedId))) invalid('Invalid select overlay')
    for (const value of overlay.items) {
      const item = wireRecord(value)
      fields(item, ['id', 'label', 'disabled'])
      if (!wireId(item.id) || typeof item.label !== 'string' || (item.disabled !== undefined && typeof item.disabled !== 'boolean')) invalid('Invalid overlay option')
    }
  }
  else if (overlay.kind === 'tooltip') {
    fields(overlay, ['kind', 'content', 'placement', 'distance'])
    if (typeof overlay.content !== 'string' || (overlay.placement !== undefined && !['top', 'bottom', 'left', 'right'].includes(overlay.placement as string))
      || (overlay.distance !== undefined && (typeof overlay.distance !== 'number' || !Number.isFinite(overlay.distance)))) {
      invalid('Invalid tooltip overlay')
    }
  }
  else {
    invalid('Unknown overlay kind')
  }
}

/** Validates every finite publication before parent observers/framework rendering. */
export function validateBridgeEventPayload(event: HistoireBridgeEvent, value: unknown): void {
  const input = wireRecord(value)
  if (event === 'catalog.changed') {
    validateHistoireSourceDescriptor(input.descriptor)
  }
  else if (event === 'content.changed') {
    if (!Array.isArray(input.storyIds) || input.storyIds.some(id => !wireId(id))) invalid('Invalid changed-content targets')
  }
  else if (event === 'selection.changed') {
    if (input.target !== null) validateHistoireTarget(input.target)
  }
  else if (event === 'settings.changed') {
    validateSettingsPatch(input)
  }
  else if (event === 'state.changed') {
    validateHistoireStateSnapshot(input)
  }
  else if (event === 'layout.changed') {
    validateHistoireViewports(input.viewports)
  }
  else if (event === 'events.appended') {
    if (!Array.isArray(input.items) || input.items.length > 1000 || (input.reset !== undefined && typeof input.reset !== 'boolean') || (input.droppedCount !== undefined && (!Number.isSafeInteger(input.droppedCount) || (input.droppedCount as number) < 0))) invalid('Invalid event batch')
    for (const entry of input.items) validateHistoireEvent(entry)
  }
  else if (event === 'readiness.changed') {
    validateHistoireRuntimeSnapshot(input.runtime)
  }
  else if (event === 'source.disconnected') {
    if (input.reason !== undefined) validateHistoireErrorData(input.reason)
  }
  else if (event === 'tests.progress') {
    if (!wireId(input.runId) || !['collecting', 'running', 'completed', 'cancelled', 'failed'].includes(input.status as string)) invalid('Invalid test progress')
    for (const key of ['completed', 'total']) {
      if (input[key] !== undefined && (!Number.isSafeInteger(input[key]) || (input[key] as number) < 0)) invalid('Invalid test progress count')
    }
    if (input.summary !== undefined) validateHistoireTestResult(input.summary, true)
    if (input.error !== undefined) validateHistoireErrorData(input.error)
  }
  else if (['overlay.open', 'overlay.update', 'overlay.close'].includes(event)) {
    validateOverlay(input, event === 'overlay.close')
  }
  else if (event === 'overlay.result') {
    fields(input, ['id', 'restoreFocus', 'itemId', 'focusDirection'])
    if (!wireId(input.id) || typeof input.restoreFocus !== 'boolean' || (input.itemId !== undefined && !wireId(input.itemId))
      || (input.focusDirection !== undefined && !['next', 'previous'].includes(input.focusDirection as string))) {
      invalid('Invalid overlay result')
    }
  }
  else if (event === 'controls.height') {
    fields(input, ['height', 'hasControls'])
    if (typeof input.height !== 'number' || !Number.isFinite(input.height) || input.height < 0 || (input.hasControls !== undefined && typeof input.hasControls !== 'boolean')) invalid('Invalid controls height')
  }
  else if (event === 'focus.changed') {
    fields(input, ['focused', 'direction', 'action'])
    if (typeof input.focused !== 'boolean' || (input.direction !== undefined && !['next', 'previous'].includes(input.direction as string)) || (input.action !== undefined && input.action !== 'search') || (input.action !== undefined && input.direction !== undefined)) invalid('Invalid focus state')
  }
  else if (event === 'channel.message') {
    validateHostChannelPayload(input, true)
  }
}
