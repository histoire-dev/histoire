import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeConfigPath } from '../config/codemod/analyze.js'
import { createConfig } from '../config/codemod/create.js'
import { editConfig } from '../config/codemod/edit.js'
import { cleanupConfigBackups, configFileHash, restoreConfigBackup, writeConfig } from '../config/codemod/write.js'
import { loadConfigFile, resolveConfig } from '../config/load.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('config file writes', () => {
  it.each([
    ['typescript', 'histoire.config.ts', true],
    ['esm', 'histoire.config.js', true],
    ['cjs', 'histoire.config.js', false],
  ])('creates a loadable %s config with only selected keys', async (kind, filename, esm) => {
    const { root } = await configTestProject()
    if (kind === 'typescript') await writeFile(join(root, 'tsconfig.json'), '{}')
    if (kind === 'esm') await writeFile(join(root, 'package.json'), '{ "type": "module" }')
    await mkdir(join(root, 'node_modules'))
    await symlink(fileURLToPath(new URL('../../../..', import.meta.url)), join(root, 'node_modules/histoire'), 'dir')
    const patches = [{ path: 'ui.defaultArrange', value: 'list' }] as const
    const result = await createConfig(root, [...patches])
    expect(result.file).toBe(join(root, filename))
    expect(result.code).toContain(esm ? 'export default defineConfig' : 'module.exports = defineConfig')
    expect(await configFileHash(result.file, { root })).toBeUndefined()
    const written = await writeConfig(result.file, result.code, { root, expectedHash: undefined })
    expect(written.backup).toBeUndefined()
    expect(await loadConfigFile(result.file)).toEqual({ ui: { defaultArrange: 'list' } })
  })

  it('loads edited config through existing config resolution without changing precedence', async () => {
    const { root, file } = await configTestProject('export default { theme: { defaultColorScheme: "light" }, ui: { defaultArrange: "grid" } }')
    await writeFile(join(root, 'vite.config.ts'), 'export default { histoire: { theme: { defaultColorScheme: "auto" } } }')
    const result = await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })
    await writeConfig(file, result.code, { root, expectedHash: result.hash })
    const loaded = await resolveConfig(root, 'dev')
    expect(loaded.theme.defaultColorScheme).toBe('dark')
    expect(loaded.ui.defaultArrange).toBe('grid')
  })

  it('refuses an aliased update that would change a retained config sibling', async () => {
    const source = 'const permission = "ask"; export default { agents: { permissions: { fileEdits: permission, terminal: permission } } }'
    const { root, file } = await configTestProject(source)
    await expect(
      editConfig(file, [{ path: 'agents.permissions', value: { fileEdits: 'ask', terminal: 'never' } }], { root }),
    ).rejects.toThrow('retained config value')
    expect(await readFile(file, 'utf8')).toBe(source)
  })

  it('deduplicates identical aliased edits and loads requested values', async () => {
    const source = 'const permission = "ask"; export default { agents: { permissions: { fileEdits: permission, terminal: permission } } }'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'agents.permissions', value: { fileEdits: 'never', terminal: 'never' } }], { root })
    expect(result.code).toBe(source.replace('"ask"', '"never"'))
    await writeFile(file, result.code)
    expect((await loadConfigFile(file)).agents?.permissions).toEqual({ fileEdits: 'never', terminal: 'never' })
  })

  it('uses the last overlapping patch as the final requested value', async () => {
    const source = 'export default { theme: { defaultColorScheme: "light" } }'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [
      { path: 'theme.defaultColorScheme', value: 'light' },
      { path: 'theme.defaultColorScheme', value: 'dark' },
    ], { root })
    expect(result.code).toBe(source.replace('"light"', '"dark"'))
  })

  it('preserves sequential parent and keyed-preset patch intent', async () => {
    const source = 'export default { agents: { presets: [{ id: "one", name: "One", command: "old" }] } }'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [
      { path: 'agents.presets', value: [{ id: 'one', name: 'Updated', command: 'middle' }] },
      { path: 'agents.presets[one].command', value: 'final' },
    ], { root })
    expect(result.code).toContain('name: "Updated", command: "final"')
  })

  it('refuses a shared initializer with a non-editable retained sibling', async () => {
    const source = 'const scheme = "light"; export default { theme: { defaultColorScheme: scheme, title: scheme } }'
    const { root, file } = await configTestProject(source)
    await expect(
      editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root }),
    ).rejects.toThrow('shared initializer')
    expect(await readFile(file, 'utf8')).toBe(source)
  })

  it('backs up previous bytes, restores a failed save, and cleans only owned backups', async () => {
    const original = 'export default { ui: { defaultArrange: "grid" } }'
    const { root, file } = await configTestProject(original)
    const result = await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })
    const saved = await writeConfig(file, result.code, { root, expectedHash: result.hash })
    expect(await readFile(saved.backup, 'utf8')).toBe(original)
    expect(await readFile(file, 'utf8')).toBe(result.code)
    await restoreConfigBackup(file, saved.backup, { root, expectedHash: saved.hash })
    expect(await readFile(file, 'utf8')).toBe(original)
    const unrelated = join(root, '.histoire/config-backup/older-session')
    await writeFile(unrelated, 'unrelated')
    await cleanupConfigBackups(root)
    expect(await readdir(join(root, '.histoire/config-backup'))).toEqual(['older-session'])
  })

  it('refuses external changes and concurrent saves based on the same source hash', async () => {
    const { root, file } = await configTestProject('export default { ui: { defaultArrange: "grid" } }')
    const edited = await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })
    const results = await Promise.allSettled([
      writeConfig(file, edited.code, { root, expectedHash: edited.hash }),
      writeConfig(file, edited.code, { root, expectedHash: edited.hash }),
    ])
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(item => item.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('config changed on disk, reload settings')
    await writeFile(file, 'export default { responsivePresets: [] }')
    await expect(writeConfig(file, edited.code, { root, expectedHash: edited.hash })).rejects.toThrow('config changed on disk, reload settings')
    expect(await readFile(file, 'utf8')).toBe('export default { responsivePresets: [] }')
  })

  it('refuses non-config paths, paths outside root, and symlinks escaping root', async () => {
    const inside = await configTestProject('export default {}')
    const outside = await configTestProject('export default {}')
    await expect(analyzeConfigPath(outside.file, 'responsivePresets', { root: inside.root })).rejects.toThrow('outside project root')
    await expect(analyzeConfigPath(join(inside.root, 'vite.config.ts'), 'responsivePresets', { root: inside.root })).rejects.toThrow('not a Histoire config')
    const link = join(inside.root, '.histoire.ts')
    await symlink(outside.file, link)
    await expect(analyzeConfigPath(link, 'responsivePresets', { root: inside.root })).rejects.toThrow('symlink escapes')
    await symlink(outside.root, join(inside.root, '.histoire'))
    const expectedHash = await configFileHash(inside.file, { root: inside.root })
    await expect(writeConfig(inside.file, 'export default { responsivePresets: [] }', { root: inside.root, expectedHash })).rejects.toThrow('symlink escapes')
    expect(await readFile(inside.file, 'utf8')).toBe('export default {}')
  })

  it('refuses overwriting existing configs and reports absent config paths', async () => {
    const { root, file } = await configTestProject()
    expect(await analyzeConfigPath(file, 'responsivePresets', { root })).toEqual({ status: 'absent' })
    await writeFile(file, 'export default {}')
    await expect(createConfig(root, [{ path: 'responsivePresets', value: [] }])).rejects.toThrow('already has')
  })
})
