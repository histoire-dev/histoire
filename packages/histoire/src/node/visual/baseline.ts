import type { HistoireVisualCaptureSpec, HistoireVisualCase, HistoireVisualResult } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import { createCanonicalCase, createMatrixCase } from './cases.js'
import { resolveVisualConfig } from './config.js'
import { safeVisualRead, safeVisualWrite } from './files.js'
import { stableVisualJson, visualHash } from './identity.js'

/** Durable baseline repeats bounded case props in capture spec; channel budget is separate. */
export const VISUAL_BASELINE_METADATA_LIMIT = 128 * 1024

/** One approved case/profile image and exact capture policy. */
export interface VisualBaseline {
  /** Metadata format version. */
  schemaVersion: 1
  /** Full case ID. */
  caseId: string
  /** Exact durable target and props captured by this baseline. */
  case: HistoireVisualCase
  /** Full profile ID. */
  profileId: string
  /** Exact resolved rendering settings. */
  spec: HistoireVisualCaptureSpec
  /** Platform namespace. */
  platform: string
  /** Immutable PNG content address. */
  imageHash: string
  /** Device-pixel dimensions. */
  dimensions: { width: number, height: number }
  /** Browser which produced approved pixels. */
  browserVersion: string
}

/** Stable path hashes identifiers independently, never accepts raw path fragments. */
export function baselinePath(config: ResolvedVisualConfig, platform: string, caseId: string, profileId: string): string {
  return `${config.baselineDir}/baselines/${platform}/${visualHash(caseId)}/${visualHash(profileId)}.json`
}

/** Validate metadata against independently resolved target before reading its image. */
export function parseVisualBaseline(bytes: Uint8Array, caseId: string, profileId: string, platform: string): VisualBaseline {
  if (bytes.byteLength > VISUAL_BASELINE_METADATA_LIMIT) throw new Error('Invalid visual baseline metadata')
  const value = JSON.parse(new TextDecoder().decode(bytes)) as VisualBaseline
  if (value.schemaVersion !== 1 || value.caseId !== caseId || value.case?.id !== caseId || !value.case.storyId || !value.case.variantId || value.profileId !== profileId || value.platform !== platform || !/^[a-f0-9]{64}$/.test(value.imageHash) || !value.spec || value.spec.id !== profileId || !Number.isInteger(value.dimensions?.width) || !Number.isInteger(value.dimensions?.height) || value.dimensions.width < 1 || value.dimensions.height < 1 || typeof value.browserVersion !== 'string') {
    throw new Error('Invalid visual baseline metadata')
  }
  try {
    // Metadata cannot borrow another target's ID or omit resolved profile settings.
    const expectedCase = value.case.kind === 'canonical'
      ? createCanonicalCase(value.case.storyId, value.case.variantId, value.case.label)
      : value.case.kind === 'matrix' ? createMatrixCase(value.case) : undefined
    const { propsOverride, ...profile } = value.spec
    const resolved = resolveVisualConfig({ profiles: [profile] })!.profiles[0]
    if (!expectedCase || stableVisualJson(expectedCase) !== stableVisualJson(value.case) || stableVisualJson(resolved) !== stableVisualJson(profile) || stableVisualJson(propsOverride ?? null) !== stableVisualJson(value.case.propsOverride ?? null)) {
      throw new Error('Invalid identity or capture policy')
    }
    stableVisualJson(value, VISUAL_BASELINE_METADATA_LIMIT)
  }
  catch (cause) {
    throw new Error('Invalid visual baseline metadata', { cause })
  }
  return value
}

/** Read exact working revision even when Git comparison uses another baseline. */
export async function workingBaselineRevision(root: string, path: string): Promise<string | null> {
  const bytes = await safeVisualRead(root, path, VISUAL_BASELINE_METADATA_LIMIT)
  return bytes ? visualHash(bytes) : null
}

/** Exact baseline metadata for one approved capture, bounded before staging. */
export function visualBaselineBytes(platform: string, result: HistoireVisualResult, imageHash: string): string {
  const baseline: VisualBaseline = { schemaVersion: 1, caseId: result.case.id, case: result.case, profileId: result.spec.id, spec: result.spec, platform, imageHash, dimensions: result.currentDimensions!, browserVersion: result.browserVersion! }
  const bytes = JSON.stringify(baseline, null, 2)
  if (new TextEncoder().encode(bytes).byteLength > VISUAL_BASELINE_METADATA_LIMIT) throw new Error('Visual baseline metadata exceeds limit')
  return bytes
}

/** Publish immutable image before baseline metadata so partial writes never point at absent image. */
export async function publishVisualBaselineImage(root: string, config: ResolvedVisualConfig, image: Uint8Array): Promise<string> {
  const imageHash = visualHash(image)
  const imagePath = `${config.baselineDir}/images/${imageHash}.png`
  const existing = await safeVisualRead(root, imagePath)
  if (existing && visualHash(existing) !== imageHash) throw new Error('Working baseline image changed; run comparisons again')
  if (!existing) await safeVisualWrite(root, imagePath, image)
  return imageHash
}
