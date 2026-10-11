import type { HistoireVisualCase } from '@histoire/shared'
import type { Context } from '../context.js'
import type { ResolvedVisualConfig } from './config.js'
import { measureWireValue } from '@histoire/shared'
import micromatch from 'micromatch'
import { listVisualFiles, safeVisualRead, safeVisualWrite } from './files.js'
import { stableVisualJson, visualHash } from './identity.js'

/** Derive canonical identity from exact scoped target rather than display label. */
export function createCanonicalCase(storyId: string, variantId: string, label: string): HistoireVisualCase {
  if (typeof storyId !== 'string' || !storyId || typeof variantId !== 'string' || !variantId || typeof label !== 'string') {
    throw new Error('Invalid canonical visual case')
  }
  return { schemaVersion: 1, id: visualHash(stableVisualJson(['canonical', storyId, variantId])), kind: 'canonical', storyId, variantId, label }
}

/** Snapshot explicit Matrix props; no internal fields or lossy serialization allowed. */
export function createMatrixCase(input: Omit<HistoireVisualCase, 'id' | 'kind' | 'schemaVersion'>): HistoireVisualCase {
  if (typeof input.storyId !== 'string' || !input.storyId || typeof input.variantId !== 'string' || !input.variantId || typeof input.label !== 'string' || !input.label || input.label.length > 512 || !input.propsOverride || typeof input.propsOverride !== 'object' || Array.isArray(input.propsOverride) || (input.axes !== undefined && (!input.axes || typeof input.axes !== 'object' || Array.isArray(input.axes)))) {
    throw new Error('Invalid saved visual case')
  }
  measureWireValue(input.propsOverride, { maxBytes: 16 * 1024 })
  if (Object.keys(input.propsOverride).some(name => name.startsWith('_h') || ['__proto__', 'prototype', 'constructor'].includes(name))) {
    throw new Error('Invalid visual props')
  }
  const snapshot = JSON.parse(stableVisualJson(input))
  return { ...snapshot, schemaVersion: 1, kind: 'matrix', id: visualHash(stableVisualJson(['matrix', input.storyId, input.variantId, input.propsOverride])) }
}

/** Canonical inventory and saved cells share exclusions and current catalog authority. */
export async function listVisualCases(ctx: Context, config: ResolvedVisualConfig): Promise<HistoireVisualCase[]> {
  const automatic: HistoireVisualCase[] = ctx.storyFiles.filter(file => !config.exclude.some(glob => micromatch.isMatch(file.relativePath, glob, { dot: true }))).flatMap(file => !file.story || file.story.docsOnly ? [] : file.story.variants.map(variant => createCanonicalCase(file.story.id, variant.id, `${file.story.title} › ${variant.title}`)))
  const saved: HistoireVisualCase[] = []
  for (const name of await listVisualFiles(ctx.root, `${config.baselineDir}/cases`)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) {
      continue
    }
    const bytes = await safeVisualRead(ctx.root, `${config.baselineDir}/cases/${name}`, 64 * 1024)
    if (!bytes) {
      continue
    }
    const parsed = JSON.parse(bytes.toString('utf8')) as HistoireVisualCase
    const item = createMatrixCase(parsed)
    if (parsed.schemaVersion !== 1 || parsed.kind !== 'matrix' || item.id !== parsed.id || `${item.id}.json` !== name) {
      throw new Error('Invalid saved visual case metadata')
    }
    if (automatic.some(target => target.storyId === item.storyId && target.variantId === item.variantId)) {
      saved.push(item)
    }
  }
  return [...automatic, ...saved]
}

/** Save deduplicated Matrix definition, never baseline images. */
export async function saveVisualCase(ctx: Context, config: ResolvedVisualConfig, input: Parameters<typeof createMatrixCase>[0]): Promise<HistoireVisualCase> {
  const item = createMatrixCase(input)
  if (!(await listVisualCases(ctx, config)).some(target => target.storyId === item.storyId && target.variantId === item.variantId)) {
    throw new Error('Visual target unavailable')
  }
  await safeVisualWrite(ctx.root, `${config.baselineDir}/cases/${item.id}.json`, JSON.stringify(item, null, 2))
  return item
}
