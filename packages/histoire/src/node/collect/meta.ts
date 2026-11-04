import type { HistoireMeta } from '@histoire/protocol'
import type { ServerStory } from '@histoire/shared'
import { normalizeHistoireMeta } from '@histoire/protocol'

/** Normalized `meta` fields of a collected story or variant. */
export interface CollectedMetaFields {
  /** Frozen JSON part of collected `meta`. */
  meta?: HistoireMeta
  /** Collected `meta` exceeded the metadata bounds and was dropped. */
  metaOmitted?: true
}

/**
 * Normalizes the `meta` of one collected story or variant, keeping an earlier omission.
 * Idempotent: normalized input yields an equal copy.
 * @param source Story or variant as collected.
 * @param source.meta Collected `meta`, possibly holding framework values (callbacks, components, cycles).
 * @param source.metaOmitted Whether an earlier boundary already dropped oversized `meta`.
 */
export function normalizeCollectedMeta(source: { meta?: unknown, metaOmitted?: boolean }): CollectedMetaFields {
  const { meta, tooLarge } = normalizeHistoireMeta(source.meta)
  return {
    ...(meta ? { meta } : {}),
    ...(tooLarge || source.metaOmitted ? { metaOmitted: true as const } : {}),
  }
}

/**
 * Replaces story and variant `meta` with bounded JSON in place, at the collection boundary.
 * Framework collectors push raw `meta` (functions, components, React elements, cycles) that
 * the worker's structured clone, catalog and build JSON cannot carry.
 * @param storyData Stories collected from one story file.
 */
export function sanitizeCollectedMeta(storyData: ServerStory[]): ServerStory[] {
  for (const target of [...storyData, ...storyData.flatMap(story => story.variants ?? [])]) {
    const fields = normalizeCollectedMeta(target)
    delete target.meta
    delete target.metaOmitted
    Object.assign(target, fields)
  }
  return storyData
}
