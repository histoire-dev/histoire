import type { MarketplacePrefs } from '@histoire/shared'
import { readFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { createJobRunner } from '../../marketplace/jobs/runner.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { jobProject, lockBytes, packageBytes } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

// Real runner, planner, filesystem and child processes; only external managers
// are fixtures. Exit zero alone cannot prove recovery: inspect installed state
// and exact original bytes after managers deliberately rewrite both on repair.
it.each([
  ['pnpm', {}, ['install', '--frozen-lockfile'], 'pnpm-lock.yaml'],
  ['pnpm', { workspace: true }, ['install', '--frozen-lockfile', '-w'], 'pnpm-lock.yaml'],
  ['npm', {}, ['ci'], 'package-lock.json'],
  ['npm', { noLock: true }, ['install', '--no-save'], undefined],
  ['yarn', {}, ['install', '--frozen-lockfile'], 'yarn.lock'],
  ['yarn', { berryVersion: true }, ['install', '--immutable'], 'yarn.lock'],
  ['yarn', { berry: true }, ['install', '--immutable'], 'yarn.lock'],
  ['bun', {}, ['install', '--frozen-lockfile'], 'bun.lock'],
] as const)('repairs failed %s change with frozen argv %j', async (manager, script, argv, lockfile) => {
  const prefs: MarketplacePrefs = { ...marketplaceDefaults(), packageManager: manager }
  const fixture = await jobProject({ ...script, fail: 'ENOTFOUND registry\n' }, 'restart', { prefs })
  await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  const job = await fixture.runner.current()
  expect(job).toMatchObject({ status: 'failed', failure: { code: 'network', restored: true, leftovers: [] } })
  expect(job?.output).toContain('Restoring dependencies')
  expect(job?.output.join('\n')).toContain('Repair https://[credential]@example.com/pkg?token=[credential]')
  expect(JSON.stringify(job)).not.toMatch(/secret|hidden/)
  const calls = (await readFile(`${fixture.root}/manager-calls.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line).argv)
  expect(calls.at(-1)).toEqual(argv)
  expect(calls.filter(call => call[0] !== '--version')).toHaveLength(2)
  await expect(readFile(`${fixture.root}/node_modules/test-plugin/package.json`)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
  if (lockfile) expect(new Uint8Array(await readFile(`${fixture.root}/${lockfile}`))).toEqual(lockBytes)
  else await expect(readFile(`${fixture.root}/package-lock.json`)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([
  { resyncFailure: true },
  { repairNoop: true },
])('keeps dependency leftovers when repair fails or falsely exits zero: %j', async (script) => {
  const fixture = await jobProject({ ...script, fail: 'E404 package not found\n' })
  await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { code: 'not-found', restored: false, leftovers: expect.arrayContaining(['node_modules', 'node_modules/test-plugin']) } })
  expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
  expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
})

it.each(['update', 'remove', 'pin'] as const)('verifies original installed version after failed %s', async (kind) => {
  const fixture = await jobProject({ installedVersion: '0.9.4', fail: 'ENOTFOUND registry\n' }, 'restart', { kind })
  const originalPackage = await readFile(`${fixture.root}/package.json`)
  const originalConfig = await readFile(fixture.file)
  const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { restored: true, leftovers: [] } })
  expect(JSON.parse(await readFile(`${fixture.root}/.histoire/marketplace/job-${job.jobId}.json`, 'utf8')).installedVersion).toBe('0.9.4')
  expect(JSON.parse(await readFile(`${fixture.root}/node_modules/test-plugin/package.json`, 'utf8')).version).toBe('0.9.4')
  expect(await readFile(`${fixture.root}/package.json`)).toEqual(originalPackage)
  expect(await readFile(fixture.file)).toEqual(originalConfig)
})

it('rejects repair that installs another version instead of original installed version', async () => {
  const fixture = await jobProject({ installedVersion: '0.9.4', repairVersion: '0.8.0', fail: 'ENOTFOUND registry\n' }, 'restart', { kind: 'update' })
  await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  await fixture.runner.wait()
  expect(await fixture.runner.current()).toMatchObject({ status: 'failed', failure: { restored: false, leftovers: expect.arrayContaining(['node_modules']) } })
  expect(JSON.parse(await readFile(`${fixture.root}/node_modules/test-plugin/package.json`, 'utf8')).version).toBe('0.8.0')
})

it.each([{ sleep: true }, { badConfig: true }])('allows cancellation during dependency repair and retains project lane: %j', async (script) => {
  const fixture = await jobProject({ ...script, repairSleep: true })
  const job = await fixture.runner.start(fixture.plan.planId, fixture.plan.hash)
  let firstCancel: Promise<void> | undefined
  try {
    if (script.sleep) {
      await expect.poll(async () => (await fixture.runner.current())?.output.join('\n')).toContain('waiting')
      firstCancel = fixture.runner.cancel(job.jobId)
    }
    await expect.poll(async () => (await fixture.runner.current())?.output.join('\n'), { timeout: 8000 }).toContain('repair waiting')
    await expect.poll(async () => (await readFile(`${fixture.root}/repair-heartbeat`, 'utf8')).length).toBeGreaterThan(0)
    const other = createJobRunner({ root: fixture.root, configFile: fixture.file, plans: fixture.plans, env: fixture.env })
    await expect(other.start(fixture.plan.planId, fixture.plan.hash)).rejects.toMatchObject({ code: 'busy' })
    await fixture.runner.cancel(job.jobId)
    await firstCancel
    expect(await fixture.runner.current()).toMatchObject({ status: 'cancelled', failure: { restored: false, leftovers: expect.arrayContaining(['node_modules']) } })
    expect(await readFile(`${fixture.root}/package.json`, 'utf8')).toBe(packageBytes)
    expect(new Uint8Array(await readFile(`${fixture.root}/pnpm-lock.yaml`))).toEqual(lockBytes)
    const heartbeat = await readFile(`${fixture.root}/repair-heartbeat`, 'utf8')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(await readFile(`${fixture.root}/repair-heartbeat`, 'utf8')).toBe(heartbeat)
  }
  finally {
    await fixture.runner.cancel(job.jobId)
    await firstCancel
  }
})
