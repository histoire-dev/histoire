import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { closeContext, createContext } from '../../context.js'
import { createJobRunner } from '../../marketplace/jobs/runner.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { inventoryPackage } from './inventory-fixture.js'
import { jobProject, lockBytes, packageBytes } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

// Real processes mutate real projects. Only package-manager executable is substituted.
describe('marketplace install jobs', () => {
  it('writes reviewed config, survives a fresh context and verifies installed version', async () => {
    const fixture = await jobProject()
    const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    expect((await fixture.runner.current())?.steps.find(step => step.id === 'restart')?.state).toBe('running')
    expect(await readFile(fixture.file, 'utf8')).toContain('TestPlugin()')
    const successor = await createContext({ root: fixture.root, mode: 'dev' })
    try {
      const next = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: successor })
      const completed = await next.current()
      expect(completed).toMatchObject({ jobId: job.jobId, status: 'succeeded', contributions: [] })
      expect(completed?.steps.map(step => step.state)).toEqual(['done', 'done', 'done', 'done', 'done'])
      expect(completed?.output.join('\n')).toContain('Installed https://[credential]@example.com/pkg?token=[credential]')
      expect(JSON.stringify(completed)).not.toMatch(/secret|hidden/)
      expect(completed?.output.join('')).not.toContain(String.fromCharCode(27))
      expect(JSON.parse((await readFile(`${fixture.root}/manager-calls.jsonl`, 'utf8')).trim())).toEqual({ argv: ['add', '-D', 'test-plugin@1.2.3'], ci: '1' })
    }
    finally { await closeContext(successor) }
  })

  it('restores package, binary lock and dependencies on package failure', async () => {
    const fixture = await jobProject({ fail: 'ERR_PNPM_PEER_DEP_ISSUES\n✕ unmet peer vite@"^7.0.0": found 6.1.0\n' })
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { code: 'peer-conflict', restored: true, leftovers: [] } })
    expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
    expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
    expect(await readFile(fixture.file, 'utf8')).toBe('export default { plugins: [] }\n')
  })

  // Defect: pnpm add exits zero on peer conflicts, so the exit code alone reports success.
  it.each([
    [{ vite: '^7.0.0' }, undefined, true],
    [{ vite: '^7.0.0' }, { vite: { optional: true } }, false],
    [{ vite: '^6.0.0' }, undefined, false],
  ])('checks installed peers %j (meta %j) after a zero exit, conflict %s', async (peers, peersMeta, conflict) => {
    const fixture = await jobProject({ peers, peersMeta })
    await inventoryPackage(fixture.root, 'vite', '6.1.0')
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    const job = await fixture.runner.current()
    if (!conflict) {
      expect(job?.failure).toBeUndefined()
      return
    }
    expect(job).toMatchObject({ status: 'failed', failure: { code: 'peer-conflict', restored: true, leftovers: [] } })
    expect(job?.steps.find(step => step.id === 'install')?.state).toBe('failed')
    expect(job?.output.join('\n')).toContain('unmet peer vite@^7.0.0: found 6.1.0')
    expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
    expect(await readFile(fixture.file, 'utf8')).toBe('export default { plugins: [] }\n')
  })

  it.each([false, true])('restores config and resyncs once after invalid package config, resync failure %s', async (resyncFailure) => {
    const fixture = await jobProject({ badConfig: true, resyncFailure })
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { code: 'config-write', restored: !resyncFailure } })
    expect(await readFile(fixture.file, 'utf8')).toBe('export default { plugins: [] }\n')
    expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
    expect((await readFile(`${fixture.root}/manager-calls.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line).argv)).toEqual([['add', '-D', 'test-plugin@1.2.3'], ['install', '--frozen-lockfile']])
  })

  it('rejects stale reviews before executing a process', async () => {
    const fixture = await jobProject()
    await writeFile(`${fixture.root}/pnpm-lock.yaml`, 'concurrent change')
    await expect(fixture.runner.start(fixture.plan.planId, fixture.plan.hash)).rejects.toMatchObject({ code: 'stale' })
    await expect(readFile(`${fixture.root}/manager-calls.jsonl`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects competing runners and cancels the process tree before restoring files', async () => {
    const fixture = await jobProject({ sleep: true })
    const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    try {
      await expect.poll(async () => (await fixture.runner.current())?.output.join('\n')).toContain('waiting')
      const other = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env })
      await expect(other.start(fixture.plan.planId, fixture.plan.hash)).rejects.toMatchObject({ code: 'busy' })
      await expect.poll(async () => (await readFile(`${fixture.root}/heartbeat`, 'utf8')).length).toBeGreaterThan(0)
      await fixture.runner.cancel(job.jobId)
      expect(await fixture.runner.current()).toMatchObject({ status: 'cancelled', failure: { restored: true } })
      await expect(readFile(`${fixture.root}/node_modules/test-plugin/package.json`)).rejects.toMatchObject({ code: 'ENOENT' })
      expect((await fixture.runner.current())?.output).toContain('Restoring dependencies')
      expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
      expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
      const heartbeat = await readFile(`${fixture.root}/heartbeat`, 'utf8')
      // Reading after a real timer boundary detects surviving grandchildren.
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(await readFile(`${fixture.root}/heartbeat`, 'utf8')).toBe(heartbeat)
    }
    finally { await fixture.runner.cancel(job.jobId) }
  })
})

it('skips package-manager execution for options and protects required installed plugins', async () => {
  for (const required of [false, true]) {
    const fixture = await jobProject({ required })
    await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
    await fixture.runner.wait()
    const context = await createContext({ root: fixture.root, mode: 'dev' })
    try {
      const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context, env: fixture.env })
      await runner.current()
      const plan = await fixture.plans.plan({ ...fixture.request, kind: required ? 'remove' : 'options' })
      if (required) {
        await expect(runner.start(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'invalid' })
      }
      else {
        await runner.start(plan.planId, plan.hash)
        await runner.wait()
        expect((await runner.current())?.steps.find(step => step.id === 'install')?.state).toBe('skipped')
        const next = await createContext({ root: fixture.root, mode: 'dev' })
        try {
          const successor = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context: next })
          expect(await successor.current()).toMatchObject({ status: 'succeeded' })
        }
        finally { await closeContext(next) }
      }
      expect((await readFile(`${fixture.root}/manager-calls.jsonl`, 'utf8')).trim().split('\n')).toHaveLength(1)
    }
    finally { await closeContext(context) }
  }
})

it('rejects a missing executable before package mutation', async () => {
  const fixture = await jobProject()
  const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: { PATH: '' } })
  await expect(runner.start(fixture.plan.planId, fixture.plan.hash)).rejects.toMatchObject({ code: 'unavailable' })
  expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
  await expect(readFile(`${fixture.root}/manager-calls.jsonl`)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects package-manager writes when a config imports package.json', async () => {
  const fixture = await jobProject()
  await writeFile(fixture.file, 'import project from "./package.json"; export default { plugins: [], outDir: project.name }\n')
  const context = await createContext({ root: fixture.root, mode: 'dev' })
  try {
    const plan = await fixture.plans.plan(fixture.request)
    const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, context, env: fixture.env })
    await expect(runner.start(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'unavailable' })
    expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
    await expect(readFile(`${fixture.root}/manager-calls.jsonl`)).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally { await closeContext(context) }
})
