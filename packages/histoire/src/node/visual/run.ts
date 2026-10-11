import type { HistoireVisualCase, HistoireVisualResult, HistoireVisualRunOptions, HistoireVisualRunSummary } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualSource } from './source.js'
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { join } from 'node:path'
import { createScreenshotTask } from '../runtime/browser/screenshot.js'
import { approveVisualItems } from './approve.js'
import { baselinePath, parseVisualBaseline, workingBaselineRevision } from './baseline.js'
import { listVisualCases } from './cases.js'
import { compareVisualImages, readVisualPngDimensions, visualPixelsIdentical } from './compare.js'
import { safeVisualRead, safeVisualWrite } from './files.js'
import { fingerprintVisualSource } from './fingerprint.js'
import { createVisualGitReader } from './git.js'
import { stableVisualJson, visualHash } from './identity.js'
import { planVisualIncremental } from './incremental.js'
import { activeVisualRuns, createVisualEvidence, persistVisualEvidence, reserveVisualAdmission } from './recovery.js'
import { writeVisualReport } from './report.js'
import { visualSession } from './source.js'
import { visualCaptureSpec } from './spec.js'

/** Exact filters are intersected, never silently widened or converted to globs. */
export function selectVisualCases(cases: HistoireVisualCase[], config: ResolvedVisualConfig, options: HistoireVisualRunOptions) {
  if (options.variantId && !options.storyId) {
    throw new Error('Visual variant filter requires story')
  }
  for (const [name, value] of Object.entries(options)) {
    if (['storyId', 'variantId', 'caseId', 'profileId', 'baselineRef'].includes(name) && value !== undefined && (typeof value !== 'string' || !value)) {
      throw new Error('Invalid visual filter')
    }
  }
  const selected = cases.filter(item => (!options.storyId || item.storyId === options.storyId) && (!options.variantId || item.variantId === options.variantId) && (!options.caseId || item.id === options.caseId))
  const profiles = config.profiles.filter(profile => !options.profileId || profile.id === options.profileId)
  if (!selected.length || !profiles.length) {
    throw new Error('Visual filters selected no cases or profiles')
  }
  return { selected, profiles }
}

/**
 * Capture one comparison through existing lane and retain exact pixels on disk.
 * Resolves `true` when only capture spec changed and pixels match working-tree baseline exactly (baseline metadata refresh candidate).
 */
async function captureResult(source: VisualSource, config: ResolvedVisualConfig, run: HistoireVisualRunSummary, result: HistoireVisualResult, readBaseline: (path: string) => Promise<Uint8Array | undefined>, signal: AbortSignal, external: Set<string>, resources: Set<string>): Promise<boolean> {
  const root = source.ctx.root
  const path = baselinePath(config, run.platform, result.case.id, result.spec.id)
  result.workingRevision = await workingBaselineRevision(root, path)
  const metadata = await readBaseline(path)
  let baseline = metadata ? parseVisualBaseline(metadata, result.case.id, result.spec.id, run.platform) : undefined
  let baselineImage: Uint8Array | undefined
  if (baseline) {
    baselineImage = await readBaseline(`${config.baselineDir}/images/${baseline.imageHash}.png`)
    if (!baselineImage && run.baselineCommit) {
      baseline = undefined
      result.warning = 'Baseline image absent from selected Git commit'
    }
    else if (!baselineImage || visualHash(baselineImage) !== baseline.imageHash) {
      throw new Error('Baseline image missing or corrupted')
    }
  }
  if (baseline && baselineImage) {
    const decoded = readVisualPngDimensions(baselineImage)
    if (decoded.width !== baseline.dimensions.width || decoded.height !== baseline.dimensions.height) {
      throw new Error('Baseline dimensions are corrupted')
    }
    result.baselineDimensions = baseline.dimensions
    result.images.baseline = `${result.id}-baseline.png`
    await safeVisualWrite(root, `.histoire/visual/runs/${run.id}/images/${result.images.baseline}`, baselineImage)
  }
  const handle = source.execution.enqueue(createScreenshotTask({ ...visualSession(source, result.case.storyId, result.case.variantId, result.spec), observePage(page) {
    const origin = new URL(source.server.resolvedUrls!.local[0]).origin
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (!['http:', 'https:'].includes(url.protocol)) return
      if (url.origin !== origin) external.add(url.origin)
      else if (['image', 'font', 'media', 'stylesheet', 'fetch', 'xhr'].includes(request.resourceType())) resources.add(url.pathname)
    })
  } }))
  /** Abort belongs only to this one run, never another UI or MCP job. */
  const cancel = () => handle.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) {
    cancel()
  }
  let output: Awaited<typeof handle.result>
  try {
    output = await handle.result
  }
  finally {
    signal.removeEventListener('abort', cancel)
  }
  if (!source.isActive() || signal.aborted) {
    throw new Error('Visual capture source changed or run cancelled')
  }
  result.currentHash = output.result.sha256
  result.currentDimensions = { width: output.result.width, height: output.result.height }
  result.browserVersion = output.result.browserVersion ?? 'unknown'
  result.images.current = `${result.id}-current.png`
  await safeVisualWrite(root, `.histoire/visual/runs/${run.id}/images/${result.images.current}`, output.artifact)
  if (!baseline) {
    result.status = 'missing'
    return false
  }
  if (baseline.browserVersion !== result.browserVersion) {
    result.warning = `Chromium version changed: ${baseline.browserVersion} / ${result.browserVersion}`
  }
  if (stableVisualJson(baseline.spec) !== stableVisualJson(result.spec)) {
    if (await visualPixelsIdentical(baselineImage!, output.artifact)) {
      // Unchanged rendering always passes; Git baselines are read-only, working-tree metadata gets refreshed after run.
      Object.assign(result, { status: 'passed', diffPixels: 0, diffPixelRatio: 0 })
      return !run.baselineCommit
    }
    result.status = 'incompatible'
    result.error = 'Capture specification changed'
    return false
  }
  const compared = await compareVisualImages(baselineImage!, output.artifact, config)
  const diff = 'diff' in compared ? compared.diff : undefined
  const { diff: _diff, ...details } = { ...compared, diff }
  Object.assign(result, details)
  if (diff) {
    result.images.diff = `${result.id}-diff.png`
    await safeVisualWrite(root, `.histoire/visual/runs/${run.id}/images/${result.images.diff}`, diff)
  }
  return false
}

/**
 * Immutable run admission; all outcomes are retained including cancellation.
 * Incremental runs announce captured result IDs through `plan` before first progress.
 */
export async function runVisualComparisons(source: VisualSource, config: ResolvedVisualConfig, options: HistoireVisualRunOptions, signal: AbortSignal, observe: (run: HistoireVisualRunSummary) => void = () => {}, plan: (resultIds: string[]) => void = () => {}) {
  const cases = await listVisualCases(source.ctx, config)
  const { selected, profiles } = selectVisualCases(cases, config, options)
  const git = options.baselineRef ? await createVisualGitReader(source.ctx.root, options.baselineRef) : undefined
  const id = randomUUID()
  const admittedAt = await reserveVisualAdmission(source.ctx.root)
  const run: HistoireVisualRunSummary = { id, platform: `${platform()}-${arch()}`, baselineSource: options.baselineRef ?? 'Working tree', ...(git ? { baselineCommit: git.commit } : {}), state: 'running', results: [], total: selected.length * profiles.length, reportPath: `.histoire/visual/runs/${id}/report.json`, htmlPath: `.histoire/visual/runs/${id}/index.html`, ok: false }
  let planned: HistoireVisualResult[] = selected.flatMap(item => profiles.map(profile => ({ id: visualHash(stableVisualJson([item.id, profile.id])), case: item, spec: visualCaptureSpec(source, config, item, profile.id), status: 'cancelled' as HistoireVisualResult['status'], images: {}, workingRevision: null })))
  if (options.incremental) {
    const incremental = await planVisualIncremental(source, config, run, planned, cases)
    planned = incremental.needed
    run.total = planned.length
    run.reused = incremental.reused
    plan(planned.map(result => result.id))
  }
  observe(run)
  const readBaseline = git ? git.read : (path: string) => safeVisualRead(source.ctx.root, path)
  /** Spec-only changes with identical pixels; baseline metadata refreshed once run completes. */
  const identical: HistoireVisualResult[] = []
  activeVisualRuns.add(id)
  try {
    for (const result of planned) {
      if (signal.aborted || !source.isActive()) {
        result.error = 'Visual run cancelled'
        run.results.push(result)
        continue
      }
      const before = await fingerprintVisualSource(source, result.case)
      const external = new Set<string>()
      const resources = new Set<string>()
      let unchanged = false
      try {
        unchanged = await captureResult(source, config, run, result, readBaseline, signal, external, resources)
      }
      catch (error) {
        result.status = signal.aborted || !source.isActive() ? 'cancelled' : 'error'
        result.error = error instanceof Error ? error.message.replaceAll(/preview/gi, 'canvas').slice(0, 512) : 'Visual capture failed'
      }
      if (result.status !== 'cancelled') {
        try {
          const resourceFiles: string[] = []
          for (const resource of resources) {
            const url = decodeURIComponent(resource.startsWith(source.server.config.base) ? `/${resource.slice(source.server.config.base.length)}` : resource)
            const candidates = url.startsWith('/@fs/') ? [url.slice(4)] : [join(source.server.config.publicDir || source.ctx.root, url), join(source.ctx.root, url)]
            const file = (await Promise.all(candidates.map(async path => await lstat(path).then(entry => entry.isFile()).catch(() => false) ? path : undefined))).find(Boolean)
            if (file) {
              resourceFiles.push(file)
            }
            else {
              const module = await source.server.moduleGraph.getModuleByUrl(url)
              if (module?.id) resourceFiles.push(module.id)
              else if (!url.startsWith('/__histoire/') && !url.startsWith('/@vite/')) external.add('unverifiable asset')
            }
          }
          const evidence = await createVisualEvidence(source, config, run, result, admittedAt, before, resourceFiles)
          if (external.size) evidence.fingerprint.reason = 'External resources cannot be revalidated'
          await persistVisualEvidence(source.ctx.root, evidence)
          if (unchanged) identical.push(result)
        }
        catch (error) {
          result.status = 'error'
          result.error = error instanceof Error ? error.message : 'Visual result persistence failed'
        }
      }
      run.results.push(result)
      observe(run)
    }
    run.state = signal.aborted || !source.isActive() ? 'cancelled' : 'completed'
    run.stale = !source.isActive()
    if (run.state === 'completed' && identical.length) {
      // Full approval pipeline (locks, revision CAS, evidence); results already passed, so a failed refresh is retried next run.
      await approveVisualItems(source, config, identical.map(result => ({ run, result }))).catch(() => {})
    }
    run.ok = run.state === 'completed' && !run.reused?.failing && run.results.every(result => result.status === 'passed' || result.approved)
    // Incremental run that reused everything has nothing to report; leave no empty run folder.
    if (run.results.length) await writeVisualReport(source.ctx.root, run)
    observe(run)
    return run
  }
  finally { activeVisualRuns.delete(id) }
}
