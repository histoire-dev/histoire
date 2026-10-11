import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { safeVisualWrite } from '../visual/files.js'
import { persistVisualEvidence } from '../visual/recovery.js'
import { createVisualReportQueue } from '../visual/report-queue.js'
import { writeVisualReport } from '../visual/report.js'
import { visualRecoveryFixture } from './utils/visual-recovery.js'

it('coalesces approval changes, preserves interrupted run state and publishes offline report', async () => {
  const { root, evidence } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 10, undefined, 'small', first.run.id)
  const queue = createVisualReportQueue(root)
  first.result.approved = second.result.approved = true
  try {
    await persistVisualEvidence(root, first)
    await queue.mark(first)
    await persistVisualEvidence(root, second)
    await queue.mark(second)
    await expect(readFile(join(root, first.run.reportPath))).rejects.toMatchObject({ code: 'ENOENT' })
    await queue.flush()
    const report = JSON.parse(await readFile(join(root, first.run.reportPath), 'utf8'))
    expect(report.state).toBe('running')
    expect(report.ok).toBe(false)
    expect(report.results).toHaveLength(2)
    expect(report.results.every((result: { approved: boolean }) => result.approved)).toBe(true)
    expect(await readFile(join(root, first.run.htmlPath), 'utf8')).toContain('images/')
    await expect(readFile(join(root, `.histoire/visual/report-dirty/${first.run.id}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(queue.issues()).toEqual([])
  }
  finally { await queue.flush() }
})

it('retains repair marker after report failure and repairs it through fresh queue', async () => {
  const { root, evidence } = await visualRecoveryFixture()
  const record = await evidence('one', 10)
  record.result.approved = true
  await persistVisualEvidence(root, record)
  const damaged = `${'a'.repeat(64)}.json`
  await safeVisualWrite(root, `.histoire/visual/runs/${record.run.id}/results/${damaged}`, 'broken')
  const queue = createVisualReportQueue(root)
  await queue.mark(record)
  await queue.flush()
  expect(queue.issues()).toHaveLength(1)
  expect(JSON.parse(await readFile(join(root, `.histoire/visual/report-dirty/${record.run.id}.json`), 'utf8')).resultId).toBe(record.result.id)
  // Repair unrelated record; next process uses marker without recapturing any pixels.
  await safeVisualWrite(root, `.histoire/visual/runs/${record.run.id}/results/${damaged}`, JSON.stringify({ ...record, result: { ...record.result, id: 'a'.repeat(64) } }))
  const restarted = createVisualReportQueue(root)
  await restarted.recover()
  await restarted.flush()
  expect(restarted.issues()).toEqual([])
  expect(await readFile(join(root, record.run.htmlPath), 'utf8')).toContain('Approved')
})

it('keeps completed lifecycle and latest approval when report writers overlap', async () => {
  const { root, evidence } = await visualRecoveryFixture()
  const record = await evidence('one', 10)
  record.run.total = 1
  const original = { ...record.run, state: 'completed' as const, results: [structuredClone(record.result)], total: 1 }
  await writeVisualReport(root, original)
  record.result.approved = true
  await persistVisualEvidence(root, record)
  const first = createVisualReportQueue(root)
  const second = createVisualReportQueue(root)
  await Promise.all([first.mark(record), second.mark(record)])
  await Promise.all([first.flush(), second.flush(), writeVisualReport(root, original)])
  await writeVisualReport(root, original)
  const report = JSON.parse(await readFile(join(root, original.reportPath), 'utf8'))
  expect(report).toMatchObject({ state: 'completed', ok: true, results: [{ approved: true }] })
})
