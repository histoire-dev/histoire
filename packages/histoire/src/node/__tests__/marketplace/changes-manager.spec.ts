import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { fileDiff } from '../../marketplace/changes/diff.js'
import { detectPackageManager, packageCommand } from '../../marketplace/changes/package-manager.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('marketplace package commands', () => {
  it.each([
    ['pnpm', ['pnpm', 'add', '-D']],
    ['npm', ['npm', 'install', '-D']],
    ['yarn', ['yarn', 'add', '-D']],
    ['bun', ['bun', 'add', '-d']],
  ] as const)('uses exact argv for %s install, pin, update, remove and options', (name, prefix) => {
    const manager = { name, source: 'override' as const, workspaceRoot: false }
    expect(packageCommand(manager, { kind: 'install', id: '@scope/plugin', version: '1.2.3' })?.argv).toEqual([...prefix, '@scope/plugin@1.2.3'])
    expect(packageCommand(manager, { kind: 'update', id: '@scope/plugin', version: '2.0.0' })?.argv).toEqual([...prefix, '@scope/plugin@2.0.0'])
    expect(packageCommand(manager, { kind: 'pin', id: '@scope/plugin', version: '1.2.3' })?.argv).toEqual([...prefix, name === 'npm' || name === 'pnpm' ? '--save-exact' : '-E', '@scope/plugin@1.2.3'])
    expect(packageCommand(manager, { kind: 'remove', id: '@scope/plugin' })?.argv).toEqual([name, name === 'npm' ? 'uninstall' : 'remove', '@scope/plugin'])
    expect(packageCommand(manager, { kind: 'options', id: '@scope/plugin' })).toBeUndefined()
  })

  it('prefers override then packageManager then nearest lockfile, bounded by workspace', async () => {
    const { root } = await configTestProject()
    const child = `${root}/packages/app`
    await mkdir(child, { recursive: true })
    await writeFile(`${root}/pnpm-workspace.yaml`, 'packages: [packages/*]')
    await writeFile(`${root}/pnpm-lock.yaml`, '')
    await writeFile(`${child}/package.json`, JSON.stringify({ packageManager: 'yarn@4.0.0' }))
    expect(await detectPackageManager(child, 'bun')).toMatchObject({ name: 'bun', source: 'override' })
    expect(await detectPackageManager(child, 'auto')).toMatchObject({ name: 'yarn', source: 'packageManager' })
    await writeFile(`${child}/package.json`, '{}')
    expect(await detectPackageManager(child, 'auto')).toMatchObject({ name: 'pnpm', source: 'lockfile', workspaceRoot: false })
    await writeFile(`${child}/package-lock.json`, '')
    expect(await detectPackageManager(child, 'auto')).toMatchObject({ name: 'npm', source: 'lockfile' })
    const manager = await detectPackageManager(root, 'auto')
    expect(packageCommand(manager!, { kind: 'install', id: 'plugin', version: '1.0.0' })?.argv).toEqual(['pnpm', 'add', '-D', '-w', 'plugin@1.0.0'])
    const isolated = await configTestProject()
    expect(await detectPackageManager(isolated.root, 'auto')).toBeUndefined()
  })

  it('bounds diff context and handles insertions, deletion and unchanged bytes', () => {
    const before = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n')
    const after = before.replace('line 5', 'new five').replace('line 25', 'new twenty five')
    const diff = fileDiff('config.ts', before, after)
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(2)
    expect(diff.lines.filter(line => line.kind === 'context')).toHaveLength(12)
    expect(diff.lines.map(line => line.text)).not.toContain('line 15')
    expect(fileDiff('same', before, before).lines).toEqual([])
    expect(fileDiff('delete', 'one\ntwo\n', '').removed).toBe(2)
  })
})
