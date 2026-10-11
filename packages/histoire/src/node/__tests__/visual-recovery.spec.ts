import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { baselinePath } from '../visual/baseline.js'
import { saveVisualCase } from '../visual/cases.js'
import { safeVisualWrite } from '../visual/files.js'
import { persistVisualEvidence, recoverVisualEvidence, validateVisualEvidence } from '../visual/recovery.js'
import { createVisualReviewSession } from '../visual/review-session.js'
import { visualRecoveryFixture } from './utils/visual-recovery.js'

it('restores independently finished variants without final report and preserves newer admission', async () => {
  const { root, source, config, evidence, image } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 11)
  await persistVisualEvidence(root, first)
  await persistVisualEvidence(root, second)
  const replacement = await evidence('one', 12)
  await persistVisualEvidence(root, replacement)
  await persistVisualEvidence(root, first)
  const restored = await recoverVisualEvidence(source, config)
  expect(restored.issues).toEqual([])
  expect(restored.entries.map(entry => entry.run.id).sort()).toEqual([replacement.run.id, second.run.id].sort())
  expect(restored.entries.every(entry => !entry.staleReason)).toBe(true)
  expect(await readFile(join(root, `.histoire/visual/runs/${second.run.id}/images/${second.result.images.current}`))).toEqual(image)
})

it('invalidates changed source per variant and detects retained-image and baseline tampering', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 11)
  await persistVisualEvidence(root, first)
  await persistVisualEvidence(root, second)
  await writeFile(join(root, 'one.story.vue'), '<template>Changed</template>')
  const restored = await recoverVisualEvidence(source, config)
  expect(restored.entries.find(entry => entry.result.case.storyId === 'one')?.staleReason).toContain('Source')
  expect(restored.entries.find(entry => entry.result.case.storyId === 'two')?.staleReason).toBeUndefined()
  await safeVisualWrite(root, `.histoire/visual/runs/${second.run.id}/images/${second.result.images.current}`, 'bad')
  await expect(validateVisualEvidence(source, config, second)).rejects.toThrow('image')
  const recovered = await recoverVisualEvidence(source, config)
  expect(recovered.entries.map(entry => entry.result.case.storyId)).toEqual(['one'])
  expect(recovered.issues).toHaveLength(1)
})

it('keeps exact saved Matrix cases and named profile namespaces across targeted replacement', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  config.profiles.push({ ...config.profiles[0], id: 'dark', colorScheme: 'dark' })
  const cases = []
  for (const enabled of [false, true]) cases.push(await saveVisualCase(source.ctx, config, { storyId: 'one', variantId: 'default', label: `${enabled}`, propsOverride: { shared: 'base', enabled } }))
  const records = []
  for (const item of cases) {
    for (const profileId of ['small', 'dark']) {
      const record = await evidence('one', 10, item, profileId)
      records.push(record)
      await persistVisualEvidence(root, record)
    }
  }
  const replacement = await evidence('one', 11, cases[0], 'small')
  await persistVisualEvidence(root, replacement)
  const fresh = await recoverVisualEvidence({ ...source, ctx: { ...source.ctx } }, config)
  expect(fresh.issues).toEqual([])
  expect(fresh.entries).toHaveLength(4)
  expect(fresh.entries.map(entry => entry.run.id).sort()).toEqual([replacement.run.id, ...records.slice(1).map(record => record.run.id)].sort())
  expect(fresh.entries.map(entry => entry.result.spec.propsOverride)).toEqual(expect.arrayContaining([{ shared: 'base', enabled: false }, { shared: 'base', enabled: true }]))
})

it('omits evidence whose profile or case is absent from current config since it cannot be rerun', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  config.profiles.push({ ...config.profiles[0], id: 'dark', colorScheme: 'dark' })
  const saved = await saveVisualCase(source.ctx, config, { storyId: 'one', variantId: 'default', label: 'saved', propsOverride: { enabled: true } })
  const kept = await evidence('one', 10)
  await persistVisualEvidence(root, kept)
  await persistVisualEvidence(root, await evidence('one', 11, undefined, 'dark'))
  await persistVisualEvidence(root, await evidence('one', 12, saved))
  config.profiles.pop()
  await rm(join(root, `${config.baselineDir}/cases/${saved.id}.json`))
  const recovered = await recoverVisualEvidence(source, config)
  expect(recovered.issues).toEqual([])
  expect(recovered.entries.map(entry => entry.run.id)).toEqual([kept.run.id])
})

it('marks profile, policy and baseline changes stale without altering retained capture', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  config.profiles[0].width = 3
  expect(await validateVisualEvidence(source, config, first)).toContain('profile changed')
  config.profiles[0].width = 2
  config.threshold = 0.2
  expect(await validateVisualEvidence(source, config, first)).toBe('Comparison policy changed')
  config.threshold = 0.1
  await safeVisualWrite(root, baselinePath(config, first.run.platform, first.result.case.id, 'small'), 'external baseline')
  expect(await validateVisualEvidence(source, config, first)).toBe('Working baseline changed since capture')
})

it('detects changed and newly added public assets without reading outside trusted workspace', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const publicDir = join(root, 'public')
  await mkdir(publicDir)
  source.server.config.publicDir = publicDir
  await writeFile(join(publicDir, 'image.svg'), '<svg/>')
  const first = await evidence('one', 10)
  expect(await validateVisualEvidence(source, config, first)).toBeUndefined()
  await writeFile(join(publicDir, 'added.svg'), '<svg/>')
  expect(await validateVisualEvidence(source, config, first)).toBe('Source assets changed since capture')
  first.fingerprint.files['/etc/passwd'] = '0'.repeat(64)
  expect(await validateVisualEvidence(source, config, first)).toBe('Source dependencies cannot be revalidated')
})

it('keeps recovered approval private to review session and rejects competing or stale writes', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 11)
  await persistVisualEvidence(root, first)
  await persistVisualEvidence(root, second)
  const owner = createVisualReviewSession(() => ({ source, config }))
  const peer = createVisualReviewSession(() => ({ source, config }))
  try {
    const own = await owner.recover()
    const other = await peer.recover()
    const selected = own.results.find(result => result.case.storyId === 'one')!
    expect((await peer.approve([{ handle: selected.reviewHandle!, resultId: selected.id }]))[0].status).toBe('conflict')
    expect(await owner.approve([{ handle: selected.reviewHandle!, resultId: selected.id }])).toEqual([{ resultId: selected.id, status: 'approved' }])
    const path = baselinePath(config, first.run.platform, first.result.case.id, 'small')
    const baseline = await readFile(join(root, path))
    const competing = other.results.find(result => result.case.storyId === 'one')!
    expect((await peer.approve([{ handle: competing.reviewHandle!, resultId: competing.id }]))[0].status).toBe('conflict')
    await writeFile(join(root, 'two.story.vue'), '<template>Changed</template>')
    const stale = own.results.find(result => result.case.storyId === 'two')!
    expect((await owner.approve([{ handle: stale.reviewHandle!, resultId: stale.id }]))[0].status).toBe('conflict')
    expect(await readFile(join(root, path))).toEqual(baseline)
    await expect(readFile(join(root, baselinePath(config, second.run.platform, second.result.case.id, 'small')))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await owner.close()
    await peer.close()
  }
})

it('requires rerun for unverifiable recovered inputs but preserves live-source approval', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const captured = await evidence('one', 10)
  captured.fingerprint.reason = 'External resources cannot be revalidated'
  await persistVisualEvidence(root, captured)
  const session = createVisualReviewSession(() => ({ source, config }))
  try {
    const restored = (await session.recover()).results[0]
    expect(restored.staleReason).toBe('External resources cannot be revalidated')
    expect((await session.approve([{ handle: restored.reviewHandle!, resultId: restored.id }]))[0].status).toBe('error')
    const live = (await session.claim({ ...captured.run, state: 'completed', results: [captured.result] }))[0]
    expect(live.staleReason).toBeUndefined()
    expect((await session.approve([{ handle: live.reviewHandle!, resultId: live.id }]))[0].status).toBe('approved')
  }
  finally { await session.close() }
})

it('validates recovery one bounded page at a time and isolates corruption in later pages', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  for (let index = 1; index < 40; index++) config.profiles.push({ ...config.profiles[0], id: `profile-${index}` })
  const records = []
  for (const profile of config.profiles) {
    const captured = await evidence('one', 10, undefined, profile.id)
    records.push(captured)
    await persistVisualEvidence(root, captured)
  }
  const last = records.at(-1)!
  await safeVisualWrite(root, `.histoire/visual/runs/${last.run.id}/images/${last.result.images.current}`, 'corrupt')
  const session = createVisualReviewSession(() => ({ source, config }))
  try {
    const first = await session.recoverPage()
    expect(first.results.map(result => result.spec.id)).toEqual(config.profiles.slice(0, 32).map(profile => profile.id))
    expect(first.issues).toEqual([])
    expect(first.nextOffset).toBe(32)
    const remaining = await session.recoverPage(first.nextOffset)
    expect(remaining.results.map(result => result.spec.id)).toEqual(config.profiles.slice(32, 39).map(profile => profile.id))
    expect(remaining.issues).toHaveLength(1)
    expect(remaining.nextOffset).toBeUndefined()
  }
  finally { await session.close() }
})
