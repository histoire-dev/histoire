import type { HistoireVisualCase, HistoireVisualResult, HistoireVisualRunSummary } from '@histoire/shared'
import type { Buffer } from 'node:buffer'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualFingerprint, VisualFingerprintValidation } from './fingerprint.js'
import type { VisualSource } from './source.js'
import { z } from 'zod/v4'
import { baselinePath, parseVisualBaseline, workingBaselineRevision } from './baseline.js'
import { withVisualCacheLock } from './cache-lock.js'
import { listVisualCases } from './cases.js'
import { readVisualPngDimensions } from './compare.js'
import { listVisualFiles, safeVisualRead, safeVisualWrite } from './files.js'
import { fingerprintVisualSource, validateVisualFingerprint } from './fingerprint.js'
import { createVisualGitReader } from './git.js'
import { stableVisualJson, visualHash } from './identity.js'
import { visualCaptureSpec } from './spec.js'

/** Original capture provenance remains separate from current review authority. */
export interface VisualEvidence {
  /** Durable metadata format. */
  schemaVersion: 1
  /** Comparison identity across runs. */
  key: string
  /** Monotonic project-owned admission order. */
  admittedAt: number
  /** Process which owns original execution; active work stays private across servers. */
  producerPid: number
  /** User-readable capture time. */
  capturedAt: string
  /** Baseline namespace used for this comparison. */
  baselineDir: string
  /** Pixel comparison policy, revalidated after restart. */
  policy: { threshold: number, includeAA: boolean, maxDiffPixelRatio: number }
  /** Original run summary, never relabelled completed during recovery. */
  run: Omit<HistoireVisualRunSummary, 'results'>
  /** Independently finished outcome. */
  result: HistoireVisualResult
  /** Restart-valid source authority. */
  fingerprint: VisualFingerprint
  /** Digests for every retained artifact. */
  digests: Partial<Record<'baseline' | 'current' | 'diff', string>>
  /** Recovery freshness, recomputed rather than trusted from disk. */
  staleReason?: string
}

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const uuid = z.string().uuid()
const fingerprintSchema = z.object({ files: z.record(z.string(), hash), assets: z.record(z.string(), hash), virtual: z.record(z.string(), hash), runtime: z.string(), reason: z.string().optional() })
const evidenceSchema = z.object({ schemaVersion: z.literal(1), key: hash, admittedAt: z.number().int().nonnegative().safe(), producerPid: z.number().int().positive(), capturedAt: z.iso.datetime(), baselineDir: z.string(), policy: z.object({ threshold: z.number().min(0).max(1), includeAA: z.boolean(), maxDiffPixelRatio: z.number().min(0).max(1) }), run: z.object({ id: uuid, platform: z.string().regex(/^[\w-]+$/), baselineSource: z.string(), baselineCommit: z.string().regex(/^[a-f0-9]{40,64}$/).optional(), state: z.enum(['running', 'completed', 'cancelled']), total: z.number().int().nonnegative(), reportPath: z.string(), htmlPath: z.string(), ok: z.boolean(), stale: z.boolean().optional() }), result: z.object({ id: hash, case: z.unknown(), spec: z.unknown(), status: z.enum(['passed', 'changed', 'missing', 'incompatible', 'error']), images: z.object({ baseline: z.string().optional(), current: z.string().optional(), diff: z.string().optional() }), workingRevision: hash.nullable(), currentHash: hash.optional(), browserVersion: z.string().optional(), currentDimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(), baselineDimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(), diffPixels: z.number().int().nonnegative().optional(), diffPixelRatio: z.number().min(0).max(1).optional(), error: z.string().optional(), warning: z.string().optional(), approved: z.boolean().optional() }), fingerprint: fingerprintSchema, digests: z.object({ baseline: hash.optional(), current: hash.optional(), diff: hash.optional() }) })
const pointerSchema = z.object({ runId: uuid, resultId: hash, admittedAt: z.number().int().nonnegative().safe() })
/** Runtime jobs remain private until originating run has left its execution scope. */
export const activeVisualRuns = new Set<string>()

/** Internal approval preparation keeps verified pixels and shared hashes within one request. */
export interface VisualEvidenceValidation {
  /** Retained files checked by digest and dimensions, keyed by safe relative path. */
  artifacts: Map<string, Buffer>
  /** Shared source inputs still receive a fresh synchronous publication fence. */
  fingerprint: VisualFingerprintValidation
}

/** Opaque key separates working tree and each named Git baseline source. */
export function visualComparisonKey(run: Pick<HistoireVisualRunSummary, 'platform' | 'baselineSource'>, result: HistoireVisualResult, baselineDir: string): string {
  return visualHash(stableVisualJson([run.platform, result.case.id, result.spec.id, baselineDir, run.baselineSource]))
}

/** Cross-process admission order prevents an older late completion replacing newer evidence. */
export async function reserveVisualAdmission(root: string): Promise<number> {
  return withVisualCacheLock(root, 'admission', async () => {
    const previous = await safeVisualRead(root, '.histoire/visual/admission.json', 128)
    const value = previous ? z.number().int().nonnegative().safe().parse(JSON.parse(previous.toString())) : 0
    const next = Math.max(Date.now(), value + 1)
    await safeVisualWrite(root, '.histoire/visual/admission.json', JSON.stringify(next))
    return next
  })
}

/** Retain completed pixels and post-capture graph, checking initial dependencies once more. */
export async function createVisualEvidence(source: VisualSource, config: ResolvedVisualConfig, run: HistoireVisualRunSummary, result: HistoireVisualResult, admittedAt: number, before?: VisualFingerprint, resourceFiles: string[] = []): Promise<VisualEvidence> {
  const fingerprint = await fingerprintVisualSource(source, result.case, resourceFiles)
  if (before) {
    const reason = await validateVisualFingerprint(source, before)
    if (reason) fingerprint.reason ??= reason
  }
  if (!source.isActive()) fingerprint.reason = 'Source changed during capture'
  const digests: VisualEvidence['digests'] = {}
  for (const [kind, name] of Object.entries(result.images)) {
    const bytes = await safeVisualRead(source.ctx.root, `.histoire/visual/runs/${run.id}/images/${name}`)
    if (!bytes) throw new Error('Retained visual image missing')
    digests[kind as keyof typeof digests] = visualHash(bytes)
  }
  if (!source.isActive()) fingerprint.reason = 'Source changed during capture'
  const { results: _results, ...summary } = run
  return { schemaVersion: 1, key: visualComparisonKey(run, result, config.baselineDir), admittedAt, producerPid: process.pid, capturedAt: new Date().toISOString(), baselineDir: config.baselineDir, policy: { threshold: config.threshold, includeAA: config.includeAA, maxDiffPixelRatio: config.maxDiffPixelRatio }, run: summary, result: structuredClone(result), fingerprint, digests }
}

/** Atomic record then pointer publication; cancelled/unstarted work never reaches this function. */
export async function persistVisualEvidence(root: string, evidence: VisualEvidence): Promise<void> {
  const { staleReason: _staleReason, ...record } = evidence
  await safeVisualWrite(root, `.histoire/visual/runs/${evidence.run.id}/results/${evidence.result.id}.json`, stableVisualJson(record, 2 * 1024 * 1024))
  await withVisualCacheLock(root, evidence.key, async () => {
    const path = `.histoire/visual/latest/${evidence.key}.json`
    const bytes = await safeVisualRead(root, path, 1024)
    const current = bytes ? pointerSchema.parse(JSON.parse(bytes.toString())) : undefined
    if (current && current.admittedAt > evidence.admittedAt) return
    await safeVisualWrite(root, path, JSON.stringify({ runId: evidence.run.id, resultId: evidence.result.id, admittedAt: evidence.admittedAt }))
  })
}

/** Validate full retained authority and artifacts before registering any image or approval. */
export async function validateVisualEvidence(source: VisualSource, config: ResolvedVisualConfig, evidence: VisualEvidence, live = false, cases?: readonly HistoireVisualCase[], validation?: VisualEvidenceValidation): Promise<string | undefined> {
  const result = evidence.result
  parseVisualBaseline(new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, caseId: result.case.id, case: result.case, profileId: result.spec.id, spec: result.spec, platform: evidence.run.platform, imageHash: result.currentHash ?? '0'.repeat(64), dimensions: result.currentDimensions ?? { width: 1, height: 1 }, browserVersion: result.browserVersion ?? 'unknown' })), result.case.id, result.spec.id, evidence.run.platform)
  if (result.id !== visualHash(stableVisualJson([result.case.id, result.spec.id])) || evidence.key !== visualComparisonKey(evidence.run, result, evidence.baselineDir)) throw new Error('Invalid cached visual identity')
  for (const [kind, name] of Object.entries(result.images)) {
    if (name !== `${result.id}-${kind}.png`) throw new Error('Invalid retained visual image path')
    const path = `.histoire/visual/runs/${evidence.run.id}/images/${name}`
    const bytes = await safeVisualRead(source.ctx.root, path)
    if (!bytes || visualHash(bytes) !== evidence.digests[kind as keyof typeof evidence.digests]) throw new Error('Retained visual image missing or changed')
    // Digest already binds bytes to capture; header dimensions avoid full pixel decode.
    const decoded = readVisualPngDimensions(bytes)
    const dimensions = kind === 'baseline' ? result.baselineDimensions : result.currentDimensions
    if (decoded.width !== dimensions?.width || decoded.height !== dimensions?.height || (kind === 'current' && visualHash(bytes) !== result.currentHash)) throw new Error('Retained visual image dimensions changed')
    validation?.artifacts.set(path, bytes)
  }
  if (result.status !== 'error' && (!result.currentHash || !result.images.current)) throw new Error('Retained visual capture missing')
  if (evidence.run.platform !== `${process.platform}-${process.arch}`) return 'Capture platform changed'
  if (evidence.policy.threshold !== config.threshold || evidence.policy.includeAA !== config.includeAA || evidence.policy.maxDiffPixelRatio !== config.maxDiffPixelRatio) return 'Comparison policy changed'
  if (evidence.baselineDir !== config.baselineDir) return 'Baseline directory changed'
  const current = (cases ?? await listVisualCases(source.ctx, config)).find(item => item.id === result.case.id)
  if (!current) return 'Visual case removed or excluded'
  try {
    if (stableVisualJson(visualCaptureSpec(source, config, current, result.spec.id)) !== stableVisualJson(result.spec)) return 'Visual case or profile changed'
  }
  catch { return 'Visual profile removed' }
  if (await workingBaselineRevision(source.ctx.root, baselinePath(config, evidence.run.platform, result.case.id, result.spec.id)) !== result.workingRevision) return 'Working baseline changed since capture'
  if (result.approved && result.currentHash) {
    const bytes = await safeVisualRead(source.ctx.root, `${config.baselineDir}/images/${result.currentHash}.png`)
    if (!bytes || visualHash(bytes) !== result.currentHash) return 'Approved baseline image changed'
  }
  else if (result.images.baseline && !evidence.run.baselineCommit) {
    const bytes = await safeVisualRead(source.ctx.root, `${config.baselineDir}/images/${evidence.digests.baseline}.png`)
    if (!bytes || visualHash(bytes) !== evidence.digests.baseline) return 'Baseline image changed since capture'
  }
  if (evidence.run.baselineCommit && !live) {
    try {
      const ref = evidence.run.baselineSource
      const git = validation ? await validation.fingerprint.read(`git:${ref}`, () => createVisualGitReader(source.ctx.root, ref)) : await createVisualGitReader(source.ctx.root, ref)
      if (git.commit !== evidence.run.baselineCommit) return 'Git baseline ref moved since capture'
    }
    catch { return 'Git baseline ref unavailable' }
  }
  return validateVisualFingerprint(source, evidence.fingerprint, live, validation?.fingerprint)
}

/**
 * Read latest published evidence for one comparison key, without validating source freshness.
 * Resolves undefined when absent or still owned by a running capture (here or in a live process).
 */
export async function readVisualLatestEvidence(root: string, key: string): Promise<VisualEvidence | undefined> {
  const pointerBytes = await safeVisualRead(root, `.histoire/visual/latest/${key}.json`, 1024)
  if (!pointerBytes) return
  const pointer = pointerSchema.parse(JSON.parse(pointerBytes.toString()))
  if (activeVisualRuns.has(pointer.runId)) return
  const bytes = await safeVisualRead(root, `.histoire/visual/runs/${pointer.runId}/results/${pointer.resultId}.json`, 2 * 1024 * 1024)
  if (!bytes) throw new Error('Cached visual result missing')
  const evidence = evidenceSchema.parse(JSON.parse(bytes.toString())) as VisualEvidence
  // Another process without final report may still be capturing; only a dead producer releases it.
  if (evidence.producerPid !== process.pid && !await safeVisualRead(root, `.histoire/visual/runs/${evidence.run.id}/report.json`)) {
    try {
      process.kill(evidence.producerPid, 0)
      return
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return }
  }
  if (evidence.key !== key || evidence.run.id !== pointer.runId || evidence.result.id !== pointer.resultId || evidence.admittedAt !== pointer.admittedAt) throw new Error('Invalid cached visual pointer')
  return evidence
}

/** Read small recovery descriptors without decoding every image before first page. */
export async function readVisualRecoveryInventory(source: VisualSource, config: ResolvedVisualConfig) {
  const entries: VisualEvidence[] = []
  const issues: string[] = []
  const names = await listVisualFiles(source.ctx.root, '.histoire/visual/latest')
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    try {
      const evidence = await readVisualLatestEvidence(source.ctx.root, name.slice(0, -'.json'.length))
      if (evidence) entries.push(evidence)
    }
    catch (error) { issues.push(error instanceof Error ? error.message.slice(0, 256) : 'Cached visual result unavailable') }
  }
  const order = new Map((await listVisualCases(source.ctx, config)).map((item, index) => [item.id, index]))
  const profiles = new Map(config.profiles.map((profile, index) => [profile.id, index]))
  // Evidence from another config sharing this root, or for removed cases/profiles, can be neither rerun nor approved here.
  const relevant = entries.filter(entry => order.has(entry.result.case.id) && profiles.has(entry.result.spec.id))
  relevant.sort((a, b) => order.get(a.result.case.id)! - order.get(b.result.case.id)! || profiles.get(a.result.spec.id)! - profiles.get(b.result.spec.id)! || a.run.baselineSource.localeCompare(b.run.baselineSource))
  return { entries: relevant, issues }
}

/** Recover complete inventory for internal consumers; browser uses bounded validation pages. */
export async function recoverVisualEvidence(source: VisualSource, config: ResolvedVisualConfig) {
  const inventory = await readVisualRecoveryInventory(source, config)
  const cases = await listVisualCases(source.ctx, config)
  const entries: VisualEvidence[] = []
  for (const evidence of inventory.entries) {
    try {
      evidence.staleReason = await validateVisualEvidence(source, config, evidence, false, cases)
      entries.push(evidence)
    }
    catch (error) { inventory.issues.push(error instanceof Error ? error.message.slice(0, 256) : 'Cached visual result unavailable') }
  }
  return { entries, issues: inventory.issues }
}

/** Exact records are validated before any review session adopts private authority. */
export async function readVisualEvidence(root: string, runId: string, resultId: string): Promise<VisualEvidence | undefined> {
  if (!uuid.safeParse(runId).success || !hash.safeParse(resultId).success) return
  const bytes = await safeVisualRead(root, `.histoire/visual/runs/${runId}/results/${resultId}.json`, 2 * 1024 * 1024)
  if (!bytes) return
  const evidence = evidenceSchema.parse(JSON.parse(bytes.toString())) as VisualEvidence
  if (evidence.run.id !== runId || evidence.result.id !== resultId) throw new Error('Invalid cached visual record')
  return evidence
}
