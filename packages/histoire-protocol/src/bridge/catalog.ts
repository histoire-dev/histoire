import type { HistoireCatalog, HistoireCatalogStory, HistoireSourceDescriptor } from '../types/catalog.js'
import { validateHostChannelNames } from '../channels.js'
import { getHistoireMatrixValues, isHistoireMatrixPropName } from '../helpers/matrix.js'
import { HISTOIRE_WIRE_LIMITS } from './limits.js'
import { measureWireValue } from './size.js'
import { validateSourceDescriptorFields } from './source-descriptor.js'
import { invalid, wireId, wireRecord } from './validation.js'

/** Finite advertised operation/surface keys. */
const operations = ['catalog', 'search', 'docs', 'rawSource', 'dynamicSource', 'state', 'customControls', 'previewTests', 'serverTests', 'openInEditor', 'hostChannels']
const surfaces = ['explorer', 'preview', 'grid', 'tree', 'search', 'toolbar', 'controls', 'docs', 'source', 'events', 'tests']

/** Validates complete availability maps before framework/UI code consumes them. */
export function validateHistoireCapabilities(value: unknown): void {
  const input = wireRecord(value)
  const views = wireRecord(input.surfaces)
  for (const [record, keys] of [[input, operations], [views, surfaces]] as const) {
    for (const key of keys) {
      const capability = wireRecord(record[key])
      if (typeof capability.available !== 'boolean' || (capability.reason !== undefined && typeof capability.reason !== 'string')) invalid('Invalid capability')
      if (capability.channels !== undefined) {
        if (key !== 'hostChannels' || record !== input) invalid('Channel names require hostChannels capability')
        validateHostChannelNames(capability.channels)
      }
    }
  }
  if (Object.keys(input).some(key => key !== 'surfaces' && !operations.includes(key)) || Object.keys(views).some(key => !surfaces.includes(key))) invalid('Unknown capability')
}

/** Relative display labels cannot expose Node paths or module identifiers. */
function validateRelativeLabel(value: unknown): void {
  if (value !== undefined && (typeof value !== 'string' || /^(?:\/|[a-z]:[\\/]|\\\\|\0)/i.test(value))) invalid('Expected relative file label')
}

/** Validates projected story/variant metadata without importing story modules. */
export function validateHistoireCatalogStory(value: unknown): HistoireCatalogStory {
  const input = wireRecord(value)
  if (!wireId(input.id) || typeof input.title !== 'string' || typeof input.docsOnly !== 'boolean') invalid('Invalid catalog story')
  if (!Array.isArray(input.path) || input.path.some(part => typeof part !== 'string')) invalid('Invalid story path')
  if (!Array.isArray(input.variants)) invalid('Expected variants')
  for (const value of input.variants) {
    const variant = wireRecord(value)
    if (!wireId(variant.id) || typeof variant.title !== 'string' || (variant.hasTests !== undefined && typeof variant.hasTests !== 'boolean')) invalid('Invalid catalog variant')
    if (variant.source !== undefined) {
      const source = wireRecord(variant.source)
      if (typeof source.raw !== 'boolean' || typeof source.dynamic !== 'boolean') invalid('Invalid source availability')
    }
  }
  const content = wireRecord(input.content)
  if (typeof content.docs !== 'boolean' || typeof content.rawSource !== 'boolean') invalid('Invalid content availability')
  for (const key of ['group', 'icon', 'iconColor', 'supportPluginId']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') invalid('Invalid catalog metadata')
  }
  validateRelativeLabel(input.relativePath)
  if (input.runtimeRevision !== undefined && (typeof input.runtimeRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.runtimeRevision))) invalid('Invalid story runtime revision')
  if (input.layout !== undefined) {
    const layout = wireRecord(input.layout)
    if (!['single', 'grid'].includes(layout.type as string) || (layout.iframe !== undefined && typeof layout.iframe !== 'boolean')) invalid('Invalid story layout')
  }
  if (input.matrix !== undefined) {
    const axes = wireRecord(wireRecord(input.matrix).axes)
    if (Object.keys(axes).length > 32) invalid('Invalid matrix axes')
    for (const [name, values] of Object.entries(axes)) {
      const finite = getHistoireMatrixValues(values)
      if (!isHistoireMatrixPropName(name) || !Array.isArray(values) || !finite || !values.length || values.length > 64 || finite.length !== new Set(values).size) invalid('Invalid matrix values')
    }
  }
  return input as unknown as HistoireCatalogStory
}

/** Validates complete catalog tree and diagnostics at shared transport boundary. */
export function validateHistoireCatalog(value: unknown): HistoireCatalog {
  measureWireValue(value, { maxBytes: HISTOIRE_WIRE_LIMITS.catalog })
  const input = wireRecord(value)
  if (!Array.isArray(input.stories) || !Array.isArray(input.tree) || !Array.isArray(input.diagnostics)) invalid('Invalid catalog')
  for (const story of input.stories) validateHistoireCatalogStory(story)
  const queue = [...input.tree]
  while (queue.length) {
    const node = wireRecord(queue.pop())
    if (typeof node.title !== 'string') invalid('Invalid tree title')
    if (node.kind === 'story') {
      if (!wireId(node.storyId)) invalid('Invalid tree story')
    }
    else if (node.kind === 'folder' || node.kind === 'group') {
      if (!Array.isArray(node.children) || (node.id !== undefined && !wireId(node.id))) invalid('Invalid tree folder')
      for (const child of node.children) queue.push(child)
    }
    else {
      invalid('Unknown catalog tree node')
    }
  }
  validateHistoireDiagnostics(input.diagnostics)
  return input as unknown as HistoireCatalog
}

/** Validates diagnostics independently when projected alongside catalog in view snapshot. */
export function validateHistoireDiagnostics(value: unknown): void {
  measureWireValue(value, { maxBytes: HISTOIRE_WIRE_LIMITS.catalog })
  if (!Array.isArray(value)) invalid('Invalid diagnostics')
  for (const entry of value) {
    const diagnostic = wireRecord(entry)
    if (!wireId(diagnostic.code) || typeof diagnostic.message !== 'string' || !['warning', 'error'].includes(diagnostic.severity as string)) invalid('Invalid diagnostic')
    if (diagnostic.storyId !== undefined && !wireId(diagnostic.storyId)) invalid('Invalid diagnostic target')
    validateRelativeLabel(diagnostic.relativePath)
  }
}

/** Handshake descriptor validation is data-only and shares catalog limits. */
export function validateHistoireSourceDescriptor(value: unknown): HistoireSourceDescriptor {
  measureWireValue(value, { maxBytes: HISTOIRE_WIRE_LIMITS.catalog })
  const input = wireRecord(value)
  if (input.descriptorVersion !== 1 || input.protocolVersion !== 1 || !wireId(input.sourceId) || !wireId(input.epoch) || !wireId(input.revision) || !['dev', 'static'].includes(input.mode as string)) invalid('Invalid source descriptor')
  validateHistoireCapabilities(input.capabilities)
  validateHistoireCatalog(input.catalog)
  validateSourceDescriptorFields(input)
  return input as unknown as HistoireSourceDescriptor
}
