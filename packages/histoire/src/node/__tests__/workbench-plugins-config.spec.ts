import type { Plugin } from '@histoire/shared'
import { realpath, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { resolveConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBrowserEntryResolver, resolveCommandClientSetupFiles } from '../config/browser-entries.js'
import { resolveWorkbenchPlugins } from '../config/workbench-plugins.js'
import { closeContext, createContext } from '../context.js'
import { resolvedConfig } from '../virtual/resolved-config.js'
import { createWorkbenchPluginProject, ODD_DIRECTORY, WORKBENCH_FIXTURE_CONFIG } from './utils/workbench-plugin-project.js'

let project: Awaited<ReturnType<typeof createWorkbenchPluginProject>>

beforeEach(async () => {
  project = await createWorkbenchPluginProject()
})

afterEach(async () => {
  await project.close()
})

/** Resolver backed by the project's real Vite resolution. */
async function createResolver() {
  const viteConfig = await resolveConfig({ root: project.root, configFile: false, logLevel: 'silent' }, 'serve')
  return createBrowserEntryResolver(project.root, viteConfig)
}

/**
 * Resolves descriptors of plain plugin objects.
 * @param plugins Node plugins as configured.
 * @param mode Context mode.
 */
async function resolvePlugins(plugins: Partial<Plugin>[], mode: 'dev' | 'build' = 'dev') {
  return resolveWorkbenchPlugins(plugins as Plugin[], await createResolver(), mode)
}

describe('workbench plugin descriptors', () => {
  it('resolves project-local and installed package entries in config order', async () => {
    const resolved = await resolvePlugins([
      { name: 'no-workbench' },
      { name: 'local-frames', workbench: { id: 'local', apiVersion: 1, frame: './plugins/frame.js' } },
      { name: 'acme-node-plugin', workbench: { id: 'acme', apiVersion: 1, client: 'acme-plugin/client', options: { tone: 'warm' } } },
      { name: 'root-relative', workbench: { id: 'root-relative', apiVersion: 1, client: '/plugins/frame.js', devOnly: true } },
    ])
    expect(resolved).toEqual([
      { id: 'local', apiVersion: 1, options: undefined, devOnly: false, frame: join(project.root, 'plugins/frame.js') },
      { id: 'acme', apiVersion: 1, options: { tone: 'warm' }, devOnly: false, client: join(await realpath(project.packageDir), 'client.js') },
      { id: 'root-relative', apiVersion: 1, options: undefined, devOnly: true, client: join(project.root, 'plugins/frame.js') },
    ])
  })

  const valid = { id: 'broken', apiVersion: 1, client: './plugins/frame.js' }
  it.each([
    ['missing entry', { ...valid, client: './plugins/missing.js' }, /plugin "broken".*workbench\.client.*missing\.js/],
    ['missing frame entry', { id: 'broken', apiVersion: 1, frame: 'not-installed/frame' }, /plugin "broken".*workbench\.frame.*not-installed/],
    ['no entry', { id: 'broken', apiVersion: 1 }, /plugin "broken".*workbench\.client/],
    ['reserved id', { ...valid, id: 'builtin' }, /plugin "broken".*workbench\.id.*reserved/],
    ['malformed id', { ...valid, id: 'Acme Plugin' }, /plugin "broken".*workbench\.id/],
    ['unsupported apiVersion', { ...valid, apiVersion: 2 }, /plugin "broken".*workbench\.apiVersion.*2/],
    ['function options', { ...valid, options: { run: () => {} } }, /plugin "broken".*workbench\.options/],
    ['non-finite options', { ...valid, options: { ratio: Number.NaN } }, /plugin "broken".*workbench\.options/],
    ['undefined option value', { ...valid, options: { value: undefined } }, /plugin "broken".*workbench\.options/],
  ])('rejects %s with an attributed error', async (_, workbench, message) => {
    await expect(resolvePlugins([{ name: 'broken', workbench } as Partial<Plugin>])).rejects.toThrow(message)
  })

  it('rejects a duplicate id naming both plugins', async () => {
    const workbench = { id: 'acme', apiVersion: 1 as const, frame: './plugins/frame.js' }
    await expect(resolvePlugins([{ name: 'first', workbench }, { name: 'second', workbench }]))
      .rejects
      .toThrow(/plugin "second".*workbench\.id.*"acme".*plugin "first"/)
  })

  it('skips resolving dev-only entries for static builds', async () => {
    const resolved = await resolvePlugins([
      { name: 'dev-tools', workbench: { id: 'dev-tools', apiVersion: 1, client: 'not-installed-in-ci', devOnly: true } },
    ], 'build')
    expect(resolved).toEqual([])
  })
})

describe('command client setup files', () => {
  it('resolves default and named setup files through the same resolution', async () => {
    const commands = [
      { id: 'default', label: 'Default', clientSetupFile: `/${ODD_DIRECTORY}/command.js` },
      { id: 'named', label: 'Named', clientSetupFile: { file: 'acme-plugin/client', importName: 'setup' } },
      { id: 'server-only', label: 'Server only' },
    ]
    const files = await resolveCommandClientSetupFiles(commands, await createResolver())
    expect([...files.entries()]).toEqual([
      [commands[0], join(project.root, ODD_DIRECTORY, 'command.js')],
      [commands[1], join(await realpath(project.packageDir), 'client.js')],
    ])
  })

  it('fails with the command id when a setup file cannot be resolved', async () => {
    await expect(resolveCommandClientSetupFiles([{ id: 'fixture:missing', label: 'Missing', clientSetupFile: '/missing.js' }], await createResolver()))
      .rejects
      .toThrow(/command "fixture:missing".*clientSetupFile.*missing\.js/)
  })
})

describe('context collection', () => {
  it.each(['dev', 'build'] as const)('projects public package and plugin details from the real %s context', async (mode) => {
    await writeFile(join(project.packageDir, 'package.json'), JSON.stringify({ name: 'acme-plugin', description: 'Package description', homepage: 'https://example.com/docs', exports: { './client': './client.js' } }))
    await project.writeConfig(`{ plugins: [{ name: 'acme-plugin', metadata: { displayName: 'Acme' }, privateField: 'hidden', workbench: { id: 'acme', apiVersion: 1, client: 'acme-plugin/client' } }] }`)
    const ctx = await createContext({ root: project.root, mode })
    try {
      const source = resolvedConfig(ctx)
      const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)
      expect(module.installedPlugins.find((item: { name: string }) => item.name === 'acme-plugin')).toEqual({ name: 'acme-plugin', builtin: false, enabled: true, id: 'acme', client: true, frame: false, displayName: 'Acme', description: 'Package description', docsUrl: 'https://example.com/docs', packageName: 'acme-plugin', version: 'local', local: true, required: false, official: false, pinned: false })
      expect(source).not.toContain('hidden')
      expect(JSON.stringify(module.installedPlugins)).not.toContain(project.root)
    }
    finally {
      await closeContext(ctx)
    }
  })

  it('collects resolved workbench plugins and command setup files at startup', async () => {
    await project.writeConfig(WORKBENCH_FIXTURE_CONFIG)
    const ctx = await createContext({ root: project.root, mode: 'dev' })
    try {
      expect(ctx.workbenchPlugins.map(plugin => plugin.id)).toEqual(['acme', 'local', 'dev-tools'])
      const command = ctx.registeredCommands.find(item => item.id === 'fixture:run')
      expect(ctx.commandClientSetupFiles.get(command)).toBe(join(project.root, ODD_DIRECTORY, 'command.js'))
    }
    finally {
      await closeContext(ctx)
    }
  })

  it('fails startup with an attributed error for an unresolvable entry', async () => {
    await project.writeConfig(`{ plugins: [{ name: 'broken', workbench: { id: 'broken', apiVersion: 1, client: './nope.js' } }] }`)
    await expect(createContext({ root: project.root, mode: 'dev' })).rejects.toThrow(/plugin "broken".*workbench\.client/)
  })
})
