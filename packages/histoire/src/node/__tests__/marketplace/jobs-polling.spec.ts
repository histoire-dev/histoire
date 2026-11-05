import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { jobProject } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

// A cached terminal snapshot remains usable even if an unrelated receipt becomes
// unreadable later. Polling must not rescan recovery records every time.
it('serves detached in-memory snapshots without rereading unrelated receipts', async () => {
  const fixture = await jobProject({ fail: 'E404' })
  await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  const first = await fixture.runner.current()
  expect(first).toMatchObject({ status: 'failed', failure: { code: 'not-found' } })
  await writeFile(`${fixture.root}/.histoire/marketplace/job-${randomUUID()}.json`, 'invalid')
  first!.output.push('caller mutation')
  const next = await fixture.runner.current()
  expect(next).toMatchObject({ status: 'failed', failure: { code: 'not-found' } })
  expect(next!.output).not.toContain('caller mutation')
})
