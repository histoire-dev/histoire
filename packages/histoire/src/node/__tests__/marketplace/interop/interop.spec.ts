import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeConfigProjects } from '../../utils/config-codemod.js'
import { availableManagers, interopProject, pluginId } from './projects.js'

afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

// Opt in explicitly: ordinary source suites must never launch real installs.
describe.skipIf(process.env.HISTOIRE_MARKETPLACE_INTEROP !== '1')('real package managers (set HISTOIRE_MARKETPLACE_INTEROP=1)', async () => {
  const managers = process.env.HISTOIRE_MARKETPLACE_INTEROP === '1' ? await availableManagers() : []
  it('requires both npm and pnpm for acceptance', () => {
    expect(managers.filter(manager => manager.available).map(manager => manager.name)).toEqual(expect.arrayContaining(['npm', 'pnpm']))
  })
  for (const manager of managers) {
    describe.skipIf(!manager.available)(`${manager.name}: ${manager.reason}`, () => {
      it('installs reviewed package and proves load in successor generation', async () => {
        const project = await interopProject(manager.name)
        const job = await project.change('install', '1.0.0')
        expect(job).toMatchObject({ status: 'succeeded', version: '1.0.0' })
        expect(job?.steps.map(step => step.state)).toEqual(['done', 'done', 'done', 'done', 'done'])
        expect(await project.version()).toBe('1.0.0')
        expect((await project.manifest()).devDependencies[pluginId]).toMatch(/^\^?1\.0\.0$/)
        expect(await readFile(project.lockfile, 'utf8')).toContain(pluginId)
        expect(await readFile(project.file, 'utf8')).toContain('TestPlugin()')
      }, 60_000)

      it('removes installed dependency and config entry across restart', async () => {
        const project = await interopProject(manager.name, { installed: true })
        expect(await project.change('remove', '1.0.0')).toMatchObject({ status: 'succeeded', kind: 'remove' })
        expect((await project.manifest()).devDependencies?.[pluginId]).toBeUndefined()
        await expect(project.version()).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await readFile(project.file, 'utf8')).not.toContain('TestPlugin')
        expect(await project.peerVersion()).toBe('6.1.0')
      }, 60_000)

      it('updates installed package and applies reviewed declarative migration', async () => {
        const project = await interopProject(manager.name, { installed: true })
        expect(await project.change('update', '2.0.0', true)).toMatchObject({ status: 'succeeded', version: '2.0.0' })
        expect(await project.version()).toBe('2.0.0')
        const config = await readFile(project.file, 'utf8')
        expect(config).toContain('new: \'retained\'')
        expect(config).toContain('keep: true')
        expect(config).not.toContain('old:')
        expect(config).toBe(project.reviewedConfig)
      }, 60_000)

      it('rejects conflicting peers, restores exact inputs, repairs dependencies and suggests compatible release', async () => {
        const project = await interopProject(manager.name, { installed: true })
        const before = await project.bytes()
        const job = await project.change('update', '3.0.0')
        expect(job, job?.output.join('\n')).toMatchObject({ status: 'failed', failure: { code: 'peer-conflict', restored: true, leftovers: [], suggestion: { version: '2.0.0' } } })
        expect(await project.bytes()).toEqual(before)
        expect(await project.version()).toBe('1.0.0')
        expect(await project.peerVersion()).toBe('6.1.0')
        expect(job?.output).toContain('Restoring dependencies')
      }, 60_000)

      it('removes installed package after successful install fails config load', async () => {
        const project = await interopProject(manager.name)
        const before = await project.bytes()
        // 2.1.0 installs normally, but its factory returns an invalid plugin.
        const job = await project.change('install', '2.1.0')
        expect(job).toMatchObject({ status: 'failed', failure: { code: 'config-write', restored: true, leftovers: [] } })
        expect(job?.steps.find(step => step.id === 'install')?.state).toBe('done')
        expect(job?.output).toContain('Restoring dependencies')
        expect(await project.bytes()).toEqual(before)
        await expect(project.version()).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await project.peerVersion()).toBe('6.1.0')
      }, 60_000)

      it('uses project npmrc token for registry metadata and package tarballs', async () => {
        const project = await interopProject(manager.name, { authenticated: true })
        expect(await project.change('install', '1.0.0')).toMatchObject({ status: 'succeeded' })
        expect(await project.version()).toBe('1.0.0')
        await project.assertAuthenticatedRequests()
      }, 60_000)
    })
  }
})
