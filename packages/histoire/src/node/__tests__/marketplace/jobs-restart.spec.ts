import type { HostRestartRequest } from '../../runtime/host-restart.js'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { readReceipt, writeReceipt } from '../../marketplace/jobs/receipt.js'
import { createJobRunner } from '../../marketplace/jobs/runner.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { jobCoordinator, jobProject, lockBytes, packageBytes } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

// Real config watcher/coordinator and loaded contexts exercise restart ownership.
// Only package-manager executables are replaced; disk bytes are the independent oracle.
describe('marketplace restart recovery', () => {
  it('pauses ask before config, continues once, and lets the watcher complete server load', async () => {
    const fixture = await jobProject({}, 'ask')
    const coordinator = await jobCoordinator(fixture.root, true)
    let runner: ReturnType<typeof createJobRunner> | undefined
    let jobId = ''
    try {
      const first = await coordinator.start()
      runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env, context: first.context })
      const job = await runner.start(fixture.plan.planId, fixture.plan.hash)
      jobId = job.jobId
      await expect.poll(async () => (await runner!.current())?.awaiting).toBe('continue')
      expect(await runner.current()).toMatchObject({ status: 'running', steps: expect.arrayContaining([{ id: 'config', state: 'pending' }]) })
      expect(await readFile(fixture.file, 'utf8')).toBe('export default { plugins: [] }\n')
      expect(coordinator.current).toBe(first)
      const other = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env })
      await expect(other.start(fixture.plan.planId, fixture.plan.hash)).rejects.toMatchObject({ code: 'busy' })
      await expect(runner.continue(randomUUID())).rejects.toMatchObject({ code: 'invalid' })
      await runner.continue(jobId)
      await runner.wait()
      await expect(runner.continue(jobId)).rejects.toMatchObject({ code: 'invalid' })
      await expect.poll(() => coordinator.current?.epoch).not.toBe(first.epoch)
      const next = await coordinator.waitForReady()
      const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: next.context })
      expect(await successor.current()).toMatchObject({ status: 'succeeded', contributions: [], steps: expect.arrayContaining([{ id: 'load', state: 'done' }]) })
      expect((await successor.current())?.awaiting).toBeUndefined()
      expect(await readFile(fixture.file, 'utf8')).toContain('TestPlugin()')
    }
    finally {
      if (jobId && (await runner?.current())?.awaiting === 'continue') await runner?.cancel(jobId)
      await coordinator.close()
    }
  })

  it('cancels while awaiting continue and restores original package and config bytes', async () => {
    const fixture = await jobProject({}, 'ask')
    const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    try {
      await expect.poll(async () => (await fixture.runner.current())?.awaiting).toBe('continue')
      await fixture.runner.cancel(job.jobId)
      expect(await fixture.runner.current()).toMatchObject({ status: 'cancelled', failure: { restored: true } })
      expect((await fixture.runner.current())?.awaiting).toBeUndefined()
      expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
      expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
      expect(await readFile(fixture.file, 'utf8')).toBe('export default { plugins: [] }\n')
    }
    finally { await fixture.runner.cancel(job.jobId) }
  })

  it('preserves a concurrent config edit made while confirmation is held', async () => {
    const fixture = await jobProject({}, 'ask')
    const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    try {
      await expect.poll(async () => (await fixture.runner.current())?.awaiting).toBe('continue')
      const concurrent = 'export default { plugins: [], outDir: "later" }\n'
      await writeFile(fixture.file, concurrent)
      await fixture.runner.continue(job.jobId)
      await fixture.runner.wait()
      expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { code: 'config-write', restored: false, leftovers: expect.arrayContaining(['histoire.config.ts']) } })
      expect(await readFile(fixture.file, 'utf8')).toBe(concurrent)
      expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
      expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
    }
    finally {
      if ((await fixture.runner.current())?.awaiting === 'continue') await fixture.runner.cancel(job.jobId)
    }
  })

  it.each(['restart', 'ask'] as const)('without a host, hands package-only %s changes to a manual restart without rewriting config', async (afterInstall) => {
    const fixture = await jobProject()
    const coordinator = await jobCoordinator(fixture.root, true)
    try {
      await coordinator.start()
      await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
      await fixture.runner.wait()
      await expect.poll(() => coordinator.current?.context.pluginInventory?.some(row => row.packageName === 'test-plugin')).toBe(true)
      const installed = await coordinator.waitForReady()
      const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: installed.context, env: fixture.env })
      await runner.current()
      const bytes = await readFile(fixture.file, 'utf8')
      const plan = await fixture.plans.plan({ ...fixture.request, kind: 'pin', prefs: { ...fixture.request.prefs, afterInstall } })
      const job = await runner.start(plan.planId, plan.hash)
      await runner.wait()
      expect(await runner.current()).toMatchObject({ status: 'running', awaiting: 'restart', steps: expect.arrayContaining([{ id: 'config', state: 'skipped' }, { id: 'restart', state: 'pending' }]) })
      expect(await readFile(fixture.file, 'utf8')).toBe(bytes)
      expect(coordinator.current).toBe(installed)
      const stale = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: installed.context })
      expect(await stale.current()).toMatchObject({ jobId: job.jobId, awaiting: 'restart' })
      await expect(stale.start(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'busy' })
      const next = await coordinator.restart()
      const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: next.context })
      expect(await successor.current()).toMatchObject({ jobId: job.jobId, status: 'succeeded', steps: expect.arrayContaining([{ id: 'config', state: 'skipped' }, { id: 'load', state: 'done' }]) })
      expect((await successor.current())?.awaiting).toBeUndefined()
    }
    finally { await coordinator.close() }
  })

  // Defect: plugin changes reloaded in the same process keep old plugin modules cached.
  it('asks the host to replace the process after a package-only change, and the successor completes load', async () => {
    const fixture = await jobProject()
    const coordinator = await jobCoordinator(fixture.root, true)
    try {
      await coordinator.start()
      await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
      await fixture.runner.wait()
      await expect.poll(() => coordinator.current?.context.pluginInventory?.some(row => row.packageName === 'test-plugin')).toBe(true)
      const installed = await coordinator.waitForReady()
      const requests: HostRestartRequest[] = []
      const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: installed.context, env: fixture.env, restart: request => requests.push(request) > 0 })
      // Completes the install's handoff and releases the project lane.
      await runner.current()
      const plan = await fixture.plans.plan({ ...fixture.request, kind: 'pin' })
      const job = await runner.start(plan.planId, plan.hash)
      await runner.wait()
      expect(requests).toEqual([{ source: 'Pinned test-plugin', fresh: true }])
      expect(await runner.current()).toMatchObject({ status: 'running', steps: expect.arrayContaining([{ id: 'config', state: 'skipped' }, { id: 'restart', state: 'running' }]) })
      expect((await runner.current())?.awaiting).toBeUndefined()
      // The proxy's replacement: a new generation picks up the handoff receipt.
      const next = await coordinator.restart()
      const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: next.context })
      expect(await successor.current()).toMatchObject({ jobId: job.jobId, status: 'succeeded', steps: expect.arrayContaining([{ id: 'load', state: 'done' }]) })
    }
    finally { await coordinator.close() }
  })

  it('holds ask-mode package-only changes for continue, then asks the host', async () => {
    const fixture = await jobProject({}, 'ask')
    const requests: HostRestartRequest[] = []
    const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env, restart: request => requests.push(request) > 0 })
    const job = await runner.start(fixture.plan.planId, fixture.plan.hash)
    await expect.poll(async () => (await runner.current())?.awaiting).toBe('continue')
    expect(requests).toEqual([])
    await runner.continue(job.jobId)
    await runner.wait()
    expect(await readFile(fixture.file, 'utf8')).toContain('TestPlugin()')
    expect(requests).toEqual([{ source: 'Installed test-plugin', fresh: true }])
  })

  it('falls back to a manual restart when the host is unreachable', async () => {
    const fixture = await jobProject({ installedVersion: '1.2.3' })
    const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env, restart: () => false })
    const plan = await fixture.plans.plan({ ...fixture.request, kind: 'pin' })
    await runner.start(plan.planId, plan.hash)
    await runner.wait()
    expect(await runner.current()).toMatchObject({ status: 'running', awaiting: 'restart', steps: expect.arrayContaining([{ id: 'restart', state: 'pending' }]) })
  })

  it('reports changed successor config as load failure without overwriting it', async () => {
    const fixture = await jobProject()
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    const saved = (await readReceipt(fixture.root))!
    saved.configHash = 'wrong'
    saved.job.awaiting = 'restart'
    saved.expires = Date.now() - 1
    await writeReceipt(fixture.root, saved)
    const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans })
    expect(await successor.current()).toMatchObject({ status: 'failed', failure: { restored: false, leftovers: expect.arrayContaining(['node_modules']) } })
    expect((await successor.current())?.awaiting).toBeUndefined()
    expect(await readFile(fixture.file, 'utf8')).toContain('TestPlugin()')
  })
})

it('sweeps all expired superseded receipts and retains recent and active files', async () => {
  const fixture = await jobProject({ fail: 'E404' })
  await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  const saved = (await readReceipt(fixture.root))!
  const expiredIds = [randomUUID(), randomUUID()]
  const recentId = randomUUID()
  const activeId = randomUUID()
  for (const jobId of [...expiredIds, recentId, activeId]) {
    await writeReceipt(fixture.root, { ...saved, job: { ...saved.job, jobId, status: jobId === activeId ? 'running' : 'failed' }, expires: jobId === recentId ? Date.now() + 60_000 : Date.now() - 1 })
  }
  await writeReceipt(fixture.root, saved)
  await fixture.runner.current()
  const files = await readdir(`${fixture.root}/.histoire/marketplace`)
  for (const id of expiredIds) expect(files).not.toContain(`job-${id}.json`)
  for (const id of [recentId, activeId, saved.job.jobId]) expect(files).toContain(`job-${id}.json`)
  expect((await readReceipt(fixture.root))?.job.jobId).toBe(saved.job.jobId)
})

it('expires terminal recovery bytes while retaining a current receipt', async () => {
  const expired = await jobProject({ fail: 'E404' })
  const retained = await jobProject({ fail: 'E404' })
  for (const fixture of [expired, retained]) {
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
  }
  const receipt = (await readReceipt(expired.root))!
  receipt.expires = Date.now() - 1
  await writeReceipt(expired.root, receipt)
  const old = createJobRunner({ root: expired.root, configFile: expired.file, plans: expired.plans })
  const fresh = createJobRunner({ root: retained.root, configFile: retained.file, plans: retained.plans })
  expect(await old.current()).toBeNull()
  expect(await readReceipt(expired.root)).toBeUndefined()
  expect(await fresh.current()).toMatchObject({ status: 'failed', failure: { code: 'not-found' } })
})

it('does not let a stale loaded context consume a successor handoff', async () => {
  const fixture = await jobProject()
  const coordinator = await jobCoordinator(fixture.root)
  try {
    const first = await coordinator.start()
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    const stale = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: first.context })
    expect(await stale.current()).toMatchObject({ status: 'running' })
    const next = await coordinator.restart()
    const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: next.context })
    expect(await successor.current()).toMatchObject({ status: 'succeeded' })
  }
  finally { await coordinator.close() }
})
