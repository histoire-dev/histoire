import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { baselinePath } from '../visual/baseline.js'
import { safeVisualWrite } from '../visual/files.js'
import { createVisualFingerprintFence, createVisualFingerprintValidation, validateVisualFingerprint } from '../visual/fingerprint.js'
import { persistVisualEvidence, readVisualEvidence } from '../visual/recovery.js'
import { createVisualReviewSession } from '../visual/review-session.js'
import { visualRecoveryFixture } from './utils/visual-recovery.js'

it('publishes group approvals with durable evidence before receipts and leaves report work outside transaction', async () => {
  const { root, source, config, evidence, image } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 11)
  await persistVisualEvidence(root, first)
  await persistVisualEvidence(root, second)
  const session = createVisualReviewSession(() => ({ source, config }))
  try {
    const restored = (await session.recover()).results
    // An unrelated broken record must not turn a valid baseline publication into failure.
    await safeVisualWrite(root, `.histoire/visual/runs/${first.run.id}/results/${'a'.repeat(64)}.json`, 'broken')
    const progress: string[] = []
    const receipts = await session.approve(restored.map(result => ({ handle: result.reviewHandle!, resultId: result.id })), async (chunk) => {
      progress.push(...chunk.map(receipt => receipt.resultId))
      for (const record of [first, second]) {
        expect((await readVisualEvidence(root, record.run.id, record.result.id))?.result.approved).toBe(true)
        await expect(readFile(join(root, baselinePath(config, record.run.platform, record.result.case.id, 'small')))).resolves.toBeDefined()
      }
    })
    expect(progress).toEqual(restored.map(result => result.id))
    expect(receipts.map(receipt => receipt.status)).toEqual(['approved', 'approved'])
    expect(await readFile(join(root, `${config.baselineDir}/images/${first.result.currentHash}.png`))).toEqual(image)
    await session.flushReports()
    expect(session.reportIssues()).toHaveLength(1)
  }
  finally { await session.close() }
})

it('rechecks source content at publication and fails only fingerprints whose dependencies changed', async () => {
  const { root, source, evidence } = await visualRecoveryFixture()
  const one = await evidence('one', 10)
  const two = await evidence('two', 11)
  const validation = createVisualFingerprintValidation()
  for (const record of [one, two]) expect(await validateVisualFingerprint(source, record.fingerprint, false, validation)).toBeUndefined()
  const open = await createVisualFingerprintFence(source, [one, two].map(record => ({ fingerprint: record.fingerprint, live: false })), validation)
  await writeFile(join(root, 'two.story.vue'), '<template>Changed during approval</template>')
  const check = open()
  expect(() => check(one.fingerprint)).not.toThrow()
  expect(() => check(two.fingerprint)).toThrow('Source changed since capture')
})

it('retirement before publication stops approvals without late receipts', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const first = await evidence('one', 10)
  const second = await evidence('two', 11)
  await persistVisualEvidence(root, first)
  await persistVisualEvidence(root, second)
  const session = createVisualReviewSession(() => ({ source, config }))
  const restored = (await session.recover()).results
  const observed: string[] = []
  try {
    const approval = session.approve(restored.map(result => ({ handle: result.reviewHandle!, resultId: result.id })), (receipts) => {
      observed.push(...receipts.map(receipt => receipt.resultId))
    })
    const closing = session.close()
    const receipts = await approval
    await closing
    expect(observed).toEqual([])
    expect(receipts.map(receipt => receipt.status)).toEqual(['conflict', 'conflict'])
    for (const record of [first, second]) {
      expect((await readVisualEvidence(root, record.run.id, record.result.id))?.result.approved).toBeUndefined()
      await expect(readFile(join(root, baselinePath(config, record.run.platform, record.result.case.id, 'small')))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  }
  finally { await session.close() }
})
