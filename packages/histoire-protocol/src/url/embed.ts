import type { HistoireEmbedDocumentOptions, HistoireEmbedPanel, HistoireEmbedPresentation } from '../types/embed-presentation.js'
import { HISTOIRE_EMBED_PANELS } from '../types/embed-presentation.js'
import { HistoireSdkError } from '../types/error.js'
import { normalizePreviewBase } from './preview.js'

/** Reject malformed presentation without widening visible capabilities. */
function invalid(message: string): never {
  throw new HistoireSdkError('INVALID_ARGUMENT', message)
}

/** Normalize panels once for URL, SDK, and native composition. */
export function validateEmbedPanels(value: unknown = ['controls']): HistoireEmbedPanel[] {
  if (!Array.isArray(value) || value.some(panel => !HISTOIRE_EMBED_PANELS.includes(panel))) invalid('Unsupported embed panel')
  return HISTOIRE_EMBED_PANELS.filter(panel => value.includes(panel))
}

/** Largest accepted embed gutter in CSS pixels. */
export const HISTOIRE_EMBED_MAX_PADDING = 1024

/** Whether a value is a usable embed gutter in CSS pixels. */
export function isEmbedPadding(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= HISTOIRE_EMBED_MAX_PADDING
}

/** Reject gutters that are negative, non-finite or unreasonably large. */
export function validateEmbedPadding(value: unknown): number {
  if (!isEmbedPadding(value)) invalid('Invalid embed padding')
  return value
}

/** Read an optional `padding` hint written as plain CSS pixels. */
export function parseEmbedPadding(query: URLSearchParams): number | undefined {
  const value = hint(query, 'padding')
  if (value === undefined) return
  if (!/^\d+(?:\.\d+)?$/.test(value)) invalid('Invalid embed padding')
  return validateEmbedPadding(Number(value))
}

/** Serialize a validated gutter so the embed document can read it back exactly. */
export function writeEmbedPadding(query: URLSearchParams, value: number): void {
  query.set('padding', String(validateEmbedPadding(value)))
}

/** Validate untyped SDK options before a surface reserves runtime ownership. */
export function validateEmbedPresentation(value: unknown): HistoireEmbedPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected embed presentation')
  const input = value as HistoireEmbedPresentation
  if (input.type !== 'embed' || !['story', 'variant'].includes(input.scope)) invalid('Unsupported embed presentation')
  return { type: 'embed', scope: input.scope, panels: validateEmbedPanels(input.panels) }
}

/** Repeated routing values cannot silently become another target or composition. */
function hint(query: URLSearchParams, key: string): string | undefined {
  const values = query.getAll(key)
  if (values.length > 1) invalid(`Repeated embed ${key}`)
  return values[0]
}

/** Read explicitly empty panels separately from omitted default panels. */
function panels(query: URLSearchParams): HistoireEmbedPanel[] {
  const value = hint(query, 'panels')
  return validateEmbedPanels(value === undefined ? undefined : value === '' ? [] : value.split(','))
}

/** Parse SDK surface presentation independently from parent handshake identity. */
export function parseEmbedPresentation(query: URLSearchParams): HistoireEmbedPresentation | undefined {
  const type = hint(query, 'presentation')
  if (type === undefined) return
  return validateEmbedPresentation({ type, scope: hint(query, 'scope'), panels: panels(query) })
}

/** Serialize only validated cosmetic hints; selection still comes from parent session. */
export function writeEmbedPresentation(query: URLSearchParams, input: HistoireEmbedPresentation): void {
  const value = validateEmbedPresentation(input)
  query.set('presentation', value.type)
  query.set('scope', value.scope)
  query.set('panels', value.panels!.join(','))
}

/** Validate exact public target IDs, retaining byte-for-byte query identity. */
export function parseEmbedDocumentOptions(query: URLSearchParams): HistoireEmbedDocumentOptions {
  const storyId = targetId(hint(query, 'storyId'))
  const variantId = hint(query, 'variantId')
  const padding = parseEmbedPadding(query)
  return { storyId, ...(variantId === undefined ? {} : { variantId: targetId(variantId) }), panels: panels(query), ...(padding === undefined ? {} : { padding }) }
}

/** Reject coercion and surrogate replacement before URLSearchParams encodes IDs. */
function targetId(value: unknown): string {
  if (typeof value !== 'string' || !value || !value.isWellFormed()) invalid('Expected exact embed story and variant IDs')
  return value
}

/** Build deployment-relative direct embed link without standalone route or runtime hints. */
export function getEmbedRelativeUrl(options: { base: string, storyId: string, variantId?: string, panels?: readonly HistoireEmbedPanel[], padding?: number }): string {
  const query = new URLSearchParams({ view: 'embed', storyId: targetId(options.storyId) })
  if (options.variantId !== undefined) query.set('variantId', targetId(options.variantId))
  query.set('panels', validateEmbedPanels(options.panels).join(','))
  if (options.padding !== undefined) writeEmbedPadding(query, options.padding)
  parseEmbedDocumentOptions(query)
  return `${normalizePreviewBase(options.base)}__embed.html?${query}`
}
