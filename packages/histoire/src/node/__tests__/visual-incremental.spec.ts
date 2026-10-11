import { access, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { planVisualIncremental } from '../visual/incremental.js'
import { persistVisualEvidence } from '../visual/recovery.js'
import { runVisualComparisons } from '../visual/run.js'
import { visualRecoveryFixture } from './utils/visual-recovery.js'

it('reuses valid passing and pending-review evidence, recapturing absent comparisons', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const one = await evidence('one', 10)
  one.result.status = 'passed'
  const two = await evidence('two', 11)
  await persistVisualEvidence(root, one)
  const plan = await planVisualIncremental(source, config, one.run, [one.result, two.result])
  expect(plan.needed.map(result => result.case.storyId)).toEqual(['two'])
  expect(plan.reused).toEqual({ total: 1, failing: 0 })
  await persistVisualEvidence(root, two)
  const next = await planVisualIncremental(source, config, one.run, [one.result, two.result])
  expect(next.needed).toEqual([])
  expect(next.reused).toEqual({ total: 2, failing: 1 })
})

it('recaptures stale sources and errored captures', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  const one = await evidence('one', 10)
  const two = await evidence('two', 11)
  two.result.status = 'error'
  await persistVisualEvidence(root, one)
  await persistVisualEvidence(root, two)
  await writeFile(join(root, 'one.story.vue'), '<template>Changed</template>')
  const plan = await planVisualIncremental(source, config, one.run, [one.result, two.result])
  expect(plan.needed.map(result => result.case.storyId)).toEqual(['one', 'two'])
  expect(plan.reused).toEqual({ total: 0, failing: 0 })
})

it('completes without writing a report when every comparison is reused', async () => {
  const { root, source, config, evidence } = await visualRecoveryFixture()
  for (const [storyId, admittedAt] of [['one', 10], ['two', 11]] as const) await persistVisualEvidence(root, await evidence(storyId, admittedAt))
  const run = await runVisualComparisons(source, config, { incremental: true }, new AbortController().signal)
  expect(run).toMatchObject({ state: 'completed', total: 0, results: [], reused: { total: 2, failing: 2 }, ok: false })
  await expect(access(join(root, `.histoire/visual/runs/${run.id}`))).rejects.toMatchObject({ code: 'ENOENT' })
})
