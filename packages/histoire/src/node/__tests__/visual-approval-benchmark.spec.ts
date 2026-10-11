import type { HistoireVisualRunSummary } from '@histoire/shared'
import type { VisualEvidence } from '../visual/recovery.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { safeVisualWrite } from '../visual/files.js'
import { visualHash } from '../visual/identity.js'
import { persistVisualEvidence } from '../visual/recovery.js'
import { writeVisualReport } from '../visual/report.js'
import { createVisualReviewSession } from '../visual/review-session.js'
import { visualRecoveryFixture } from './utils/visual-recovery.js'

const benchmark = it.skipIf(process.env.HISTOIRE_VISUAL_APPROVAL_BENCHMARK !== '1')

/** Full-size screenshot and 200 shared dependencies, matching a real story graph. */
async function benchmarkFixture() {
  const fixture = await visualRecoveryFixture()
  const { root, config } = fixture
  config.profiles[0].width = 1024
  config.profiles[0].height = 640
  const png = new PNG({ width: 1024, height: 640 })
  png.data.fill(255)
  const bytes = PNG.sync.write(png)
  const dependencies: Record<string, string> = {}
  for (let index = 0; index < 200; index++) {
    const path = join(root, `dependency-${index}.js`)
    const code = `export const value = ${index}`
    await writeFile(path, code)
    dependencies[path] = visualHash(code)
  }
  /** Replace fixture pixels with full-size capture and attach shared dependency graph. */
  async function retain(captured: VisualEvidence): Promise<VisualEvidence> {
    captured.result.currentDimensions = { width: 1024, height: 640 }
    captured.result.currentHash = captured.digests.current = visualHash(bytes)
    Object.assign(captured.fingerprint.files, dependencies)
    await safeVisualWrite(root, `.histoire/visual/runs/${captured.run.id}/images/${captured.result.images.current}`, bytes)
    return captured
  }
  return { ...fixture, retain }
}

/** Opt-in latency probe uses real full-size PNG, 200 dependencies and 1,100 retained records. */
benchmark('benchmarks durable approval independent of unrelated report size', async () => {
  const { root, source, config, evidence, retain } = await benchmarkFixture()
  const captured = await retain(await evidence('one', 10))
  captured.run.total = 1100
  const results = [captured.result]
  await persistVisualEvidence(root, captured)
  for (let index = 1; index < 1100; index++) {
    const result = { ...captured.result, id: visualHash(String(index)) }
    results.push(result)
    await safeVisualWrite(root, `.histoire/visual/runs/${captured.run.id}/results/${result.id}.json`, JSON.stringify({ ...captured, result }))
  }
  const run: HistoireVisualRunSummary = { ...captured.run, state: 'completed', results }
  await writeVisualReport(root, run)
  const session = createVisualReviewSession(() => ({ source, config }))
  try {
    const selected = (await session.recover()).results[0]
    const timings: number[] = []
    for (let index = 0; index < 20; index++) {
      const start = performance.now()
      expect(await session.approve([{ handle: selected.reviewHandle!, resultId: selected.id }])).toEqual([{ resultId: selected.id, status: 'approved' }])
      timings.push(performance.now() - start)
    }
    const firstTiming = timings[0]
    timings.sort((a, b) => a - b)
    if (process.env.HISTOIRE_VISUAL_APPROVAL_BENCHMARK_REPORT) {
      await writeFile(process.env.HISTOIRE_VISUAL_APPROVAL_BENCHMARK_REPORT, JSON.stringify({ medianMs: timings[9], p95Ms: timings[18], firstMs: firstTiming, results: 1100, dependencies: 200, width: 1024, height: 640, node: process.versions.node, platform: `${process.platform}-${process.arch}` }, null, 2))
    }
    process.stdout.write(`Approval: median ${timings[9].toFixed(1)} ms; p95 ${timings[18].toFixed(1)} ms; first ${firstTiming.toFixed(1)} ms; 1,100 records, 200 dependencies, 1024×640 PNG\n`)
    expect(timings[18]).toBeLessThanOrEqual(250)
  }
  finally { await session.close() }
})

/** Bulk selection shares one source fence, so throughput scales with screenshots, not dependencies. */
benchmark('benchmarks one bulk approval request across many variants', async () => {
  const { root, source, config, evidence, retain } = await benchmarkFixture()
  const count = 128
  for (let index = 1; index < count; index++) config.profiles.push({ ...config.profiles[0], id: `profile-${index}` })
  for (const profile of config.profiles) await persistVisualEvidence(root, await retain(await evidence('one', 10, undefined, profile.id)))
  const session = createVisualReviewSession(() => ({ source, config }))
  try {
    const restored = (await session.recover()).results
    expect(restored).toHaveLength(count)
    const start = performance.now()
    const receipts = await session.approve(restored.map(result => ({ handle: result.reviewHandle!, resultId: result.id })))
    const elapsed = performance.now() - start
    expect(receipts.every(receipt => receipt.status === 'approved')).toBe(true)
    process.stdout.write(`Bulk approval: ${elapsed.toFixed(1)} ms for ${count} variants (${(elapsed / count).toFixed(1)} ms each), 200 dependencies, 1024×640 PNG\n`)
    expect(elapsed).toBeLessThanOrEqual(1000)
  }
  finally { await session.close() }
})
