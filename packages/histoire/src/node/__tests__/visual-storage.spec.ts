import type { HistoireVisualRunSummary } from '@histoire/shared'
import type { Context } from '../context.js'
import type { VisualSource } from '../visual/source.js'
import { execFile } from 'node:child_process'
import { watch, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { approveVisualResults } from '../visual/approve.js'
import { baselinePath, parseVisualBaseline, workingBaselineRevision } from '../visual/baseline.js'
import { createCanonicalCase, listVisualCases, saveVisualCase } from '../visual/cases.js'
import { resolveVisualConfig } from '../visual/config.js'
import { safeVisualRead, safeVisualWrite, withVisualLock } from '../visual/files.js'
import { createVisualGitReader } from '../visual/git.js'
import { visualHash } from '../visual/identity.js'
import { visualSnapshot } from '../visual/snapshot.js'
import { visualCaptureSpec } from '../visual/spec.js'

const roots: string[] = []
const execute = promisify(execFile)
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Real files and catalog inputs; no capture or approval outcome substituted. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'histoire-visual-'))
  roots.push(root)
  const ctx = { root, config: { visual: { profiles: [{ id: 'small', width: 320, height: 240 }] } }, storyFiles: [{ relativePath: 'Button.story.vue', story: { id: 'button', title: 'Button', variants: [{ id: 'primary', title: 'Primary' }, { id: 'secondary', title: 'Secondary' }] } }] } as Context
  const config = resolveVisualConfig(ctx.config.visual)!
  const source = { ctx, isActive: () => true } as VisualSource
  const png = new PNG({ width: 320, height: 240 })
  png.data.fill(255)
  const image = PNG.sync.write(png)
  const run: HistoireVisualRunSummary = { id: 'retained', platform: 'linux-x64', baselineSource: 'Working tree', state: 'completed', results: [], total: 2, reportPath: '.histoire/visual/runs/retained/report.json', htmlPath: '.histoire/visual/runs/retained/index.html', ok: false }
  for (const variant of ['primary', 'secondary']) {
    const item = createCanonicalCase('button', variant, variant)
    const spec = visualCaptureSpec(source, config, item, 'small')
    run.results.push({ id: item.id, case: item, spec, status: 'missing', images: { current: `${item.id}.png` }, currentDimensions: { width: 320, height: 240 }, currentHash: visualHash(image), browserVersion: 'test-chromium', workingRevision: null })
    await safeVisualWrite(root, `.histoire/visual/runs/retained/images/${item.id}.png`, image)
  }
  return { root, ctx, config, source, run, image }
}

describe('visual baseline ownership', () => {
  it('approves exact retained target and leaves another baseline untouched', async () => {
    const { root, source, config, run } = await fixture()
    const [primary, secondary] = run.results
    const otherPath = baselinePath(config, run.platform, secondary.case.id, 'small')
    await safeVisualWrite(root, otherPath, '{"untouched":true}')
    expect(await approveVisualResults(source, config, run, [primary.id])).toEqual([{ resultId: primary.id, status: 'approved' }])
    const approved = JSON.parse((await safeVisualRead(root, baselinePath(config, run.platform, primary.case.id, 'small')))!.toString())
    expect(approved).toMatchObject({ caseId: primary.case.id, profileId: 'small', imageHash: primary.currentHash })
    expect((await safeVisualRead(root, otherPath))!.toString()).toBe('{"untouched":true}')
    expect(await readFile(join(root, config.baselineDir, 'images', `${primary.currentHash}.png`))).toEqual(await readFile(join(root, '.histoire/visual/runs/retained/images', primary.images.current!)))
    const detached = visualSnapshot(run)
    expect(() => {
      detached.results[0].spec.width = 800
    }).toThrow()
  })

  it('rejects changed baseline, case specification, retired source, and changed capture', async () => {
    const { root, source, config, run } = await fixture()
    const first = run.results[0]
    const path = baselinePath(config, run.platform, first.case.id, 'small')
    await safeVisualWrite(root, path, 'concurrent edit')
    expect((await approveVisualResults(source, config, run, [first.id]))[0].status).toBe('conflict')
    expect((await safeVisualRead(root, path))!.toString()).toBe('concurrent edit')
    first.workingRevision = await workingBaselineRevision(root, path)
    config.profiles[0].colorScheme = 'dark'
    expect((await approveVisualResults(source, config, run, [first.id]))[0].error).toContain('profile changed')
    config.profiles[0].colorScheme = 'light'
    source.isActive = () => false
    expect((await approveVisualResults(source, config, run, [first.id]))[0].error).toContain('source changed')
    source.isActive = () => true
    await safeVisualWrite(root, `.histoire/visual/runs/retained/images/${first.images.current}`, 'different bytes')
    expect((await approveVisualResults(source, config, run, [first.id]))[0].error).toContain('image missing or changed')
    expect((await safeVisualRead(root, path))!.toString()).toBe('concurrent edit')
  })

  it.each(['source', 'baseline', 'profile'] as const)('rejects %s changes during image publication', async (change) => {
    const { root, source, config, run } = await fixture()
    const result = run.results[0]
    const path = baselinePath(config, run.platform, result.case.id, 'small')
    await mkdir(join(root, config.baselineDir, 'images'), { recursive: true })
    await mkdir(dirname(join(root, path)), { recursive: true })
    let intervened = false
    const observer = watch(join(root, config.baselineDir, 'images'), (_event, name) => {
      if (name !== `${result.currentHash}.png` || intervened) return
      intervened = true
      if (change === 'source') source.isActive = () => false
      else if (change === 'profile') config.profiles[0].colorScheme = 'dark'
      else writeFileSync(join(root, path), 'external edit')
    })
    try {
      expect((await approveVisualResults(source, config, run, [result.id]))[0].status).toBe('conflict')
      expect(intervened).toBe(true)
      expect(result.approved).toBeUndefined()
      expect((await safeVisualRead(root, path))?.toString()).toBe(change === 'baseline' ? 'external edit' : undefined)
    }
    finally {
      observer.close()
    }
  })

  it('preserves bulk successes when another target conflicts', async () => {
    const { root, source, config, run } = await fixture()
    await safeVisualWrite(root, baselinePath(config, run.platform, run.results[1].case.id, 'small'), 'external change')
    expect((await approveVisualResults(source, config, run, run.results.map(result => result.id))).map(receipt => receipt.status)).toEqual(['approved', 'conflict'])
    expect(run.results.map(result => Boolean(result.approved))).toEqual([true, false])
  })

  it('reads approved Matrix baseline with large valid durable metadata', async () => {
    const { root, ctx, source, config, run } = await fixture()
    const result = run.results[0]
    result.case = await saveVisualCase(ctx, config, { storyId: 'button', variantId: 'primary', label: 'Large case', propsOverride: { text: 'x'.repeat(16300) }, axes: { text: 'x'.repeat(40000) } })
    result.spec = visualCaptureSpec(source, config, result.case, 'small')
    expect((await approveVisualResults(source, config, run, [result.id]))[0].status).toBe('approved')
    const path = baselinePath(config, run.platform, result.case.id, 'small')
    await expect(workingBaselineRevision(root, path)).resolves.toBe(result.workingRevision)
    const bytes = (await safeVisualRead(root, path))!
    expect(parseVisualBaseline(bytes, result.case.id, 'small', run.platform).case.propsOverride).toEqual(result.case.propsOverride)
  })

  it('rejects changed baseline pixels even when metadata revision remains unchanged', async () => {
    const { root, source, config, run } = await fixture()
    const result = run.results[0]
    expect((await approveVisualResults(source, config, run, [result.id]))[0].status).toBe('approved')
    await safeVisualWrite(root, `${config.baselineDir}/images/${result.currentHash}.png`, 'tampered pixels')
    expect((await approveVisualResults(source, config, run, [result.id]))[0]).toMatchObject({ status: 'conflict', error: 'Working baseline image changed; run comparisons again' })
  })

  it('rejects baseline metadata whose stored target or capture policy is malformed', async () => {
    const { root, source, config, run } = await fixture()
    const result = run.results[0]
    await approveVisualResults(source, config, run, [result.id])
    const bytes = (await safeVisualRead(root, baselinePath(config, run.platform, result.case.id, 'small')))!
    const wrongTarget = JSON.parse(bytes.toString())
    wrongTarget.case.variantId = 'other'
    expect(() => parseVisualBaseline(new TextEncoder().encode(JSON.stringify(wrongTarget)), result.case.id, 'small', run.platform)).toThrow('Invalid visual baseline')
    const malformed = JSON.parse(bytes.toString())
    delete malformed.spec.colorScheme
    expect(() => parseVisualBaseline(new TextEncoder().encode(JSON.stringify(malformed)), result.case.id, 'small', run.platform)).toThrow('Invalid visual baseline')
  })
})

describe('durable Matrix and safe storage', () => {
  it('replays two saved cases across inventory reads with exact props and exclusions', async () => {
    const { ctx, config } = await fixture()
    const first = await saveVisualCase(ctx, config, { storyId: 'button', variantId: 'primary', label: 'Enabled', propsOverride: { disabled: false, size: 'small' } })
    const second = await saveVisualCase(ctx, config, { storyId: 'button', variantId: 'primary', label: 'Disabled', propsOverride: { disabled: true, size: 'small' } })
    await saveVisualCase(ctx, config, { storyId: 'button', variantId: 'primary', label: 'Enabled', propsOverride: { size: 'small', disabled: false } })
    const fresh = await listVisualCases({ ...ctx }, { ...config })
    expect(fresh.filter(item => item.kind === 'matrix').sort((a, b) => a.id.localeCompare(b.id))).toEqual([first, second].sort((a, b) => a.id.localeCompare(b.id)))
    config.exclude = ['**/Button.story.vue']
    expect(await listVisualCases(ctx, config)).toEqual([])
  })

  it('rejects traversal and symlinks and releases exclusive locks', async () => {
    const { root } = await fixture()
    await expect(safeVisualWrite(root, '../escape.json', 'no')).rejects.toThrow()
    await symlink(tmpdir(), join(root, 'escape'))
    await expect(safeVisualRead(root, 'escape/file')).rejects.toThrow('symlinks')
    await withVisualLock(root, 'case', async () => {
      await expect(withVisualLock(root, 'case', async () => 'bad')).rejects.toThrow('locked')
    })
    expect(await withVisualLock(root, 'case', async () => 'released')).toBe('released')
  })
})

it('pins Git baselines and reads nested project blobs despite changed working tree', async () => {
  const { root } = await fixture()
  const nested = 'workspace'
  await safeVisualWrite(root, `${nested}/baseline.json`, 'committed')
  await execute('git', ['init', '--initial-branch=main'], { cwd: root })
  await execute('git', ['add', 'workspace/baseline.json'], { cwd: root })
  await execute('git', ['-c', 'user.name=Visual test', '-c', 'user.email=visual@example.test', 'commit', '-m', 'test: baseline'], { cwd: root })
  const reader = await createVisualGitReader(join(root, nested), 'main')
  await safeVisualWrite(root, `${nested}/baseline.json`, 'working edit')
  await execute('git', ['add', 'workspace/baseline.json'], { cwd: root })
  await execute('git', ['-c', 'user.name=Visual test', '-c', 'user.email=visual@example.test', 'commit', '-m', 'test: changed'], { cwd: root })
  expect(new TextDecoder().decode(await reader.read('baseline.json'))).toBe('committed')
  expect(await reader.read('missing.json')).toBeUndefined()
  await expect(createVisualGitReader(join(root, nested), 'unknown-ref')).rejects.toThrow('ref unavailable')
})
