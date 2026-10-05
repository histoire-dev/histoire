import type { Context } from '../context.js'
import type { UiChannelServer } from '../server/ui-channel/types.js'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createPresetConfigStore } from '../../../../histoire-app/src/app/stores/presets-config.js'
import { configFileHash } from '../config/codemod/index.js'
import { getDefaultConfig } from '../config/defaults.js'
import { loadConfigFile } from '../config/load.js'
import { registerConfigChannel, validateConfigRead, validateConfigSave } from '../server/ui-channel/config.js'

import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/** Minimal socket fixture drives registered handler and observes replies without opening ports. */
function channelFixture() {
  const handlers = new Map<string, (value: unknown) => unknown>()
  const messages: any[] = []
  const cleanups: (() => unknown)[] = []
  const channel = {
    on: (event, validate, handler) => {
      handlers.set(event, value => handler(validate(value), {} as never))
      return () => {}
    },
    send: (_event, data) => { messages.push(data) },
    onReady: () => () => {},
    addCleanup: (cleanup) => { cleanups.push(cleanup) },
    close: async () => { for (const cleanup of cleanups) await cleanup() },
  } satisfies UiChannelServer
  return { channel, messages, request: (event: string, value: unknown) => handlers.get(event)!(value) }
}

/** Scratch project keeps config saves separate from concurrent repo edits. */
async function project(code?: string) {
  const { root, file } = await configTestProject(code)
  if (!code) {
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
    await mkdir(path.join(root, 'node_modules'))
    await symlink(fileURLToPath(new URL('../../..', import.meta.url)), path.join(root, 'node_modules/histoire'), 'dir')
  }
  const fixture = channelFixture()
  registerConfigChannel({ root } as Context, fixture.channel)
  return { root, file, ...fixture }
}

describe('project settings channel', () => {
  it('rejects arbitrary keys, local preferences and agent environments before file access', () => {
    expect(() => validateConfigRead({ paths: ['vite'] })).toThrow('not editable')
    expect(() => validateConfigSave({ patches: [{ path: 'density', value: 'compact' }] })).toThrow('not editable')
    expect(() => validateConfigSave({ patches: [{ path: 'agents.presets', value: [{ id: 'a', env: { SECRET: 'value' } }] }] })).toThrow('Agent env values cannot be saved')
  })

  it('refuses keyed agent preset identity changes before writing source', async () => {
    const source = 'export default { agents: { presets: [{ id: "one", name: "One", command: "agent" }, { id: "two", name: "Two", command: "agent" }] } }'
    const fixture = await project(source)
    const hash = await configFileHash(fixture.file, { root: fixture.root })
    for (const patch of [
      { path: 'agents.presets[one].id', value: 'renamed' },
      { path: 'agents.presets[one]', value: { id: 'two', name: 'One', command: 'agent' } },
    ]) {
      await fixture.request('histoire:ui:config-save', { expectedHash: hash, patches: [patch] })
      expect(fixture.messages.at(-1).error).toContain('Cannot edit keyed agent preset id')
      expect(await readFile(fixture.file, 'utf8')).toBe(source)
    }
    await fixture.request('histoire:ui:config-save', {
      expectedHash: hash,
      patches: [{ path: 'agents.presets', value: [
        { id: 'one', name: 'One', command: 'agent' },
        { id: 'one', name: 'Two', command: 'agent' },
      ] }],
    })
    expect(fixture.messages.at(-1).error).toContain('Invalid config value for agents.presets')
    expect(await readFile(fixture.file, 'utf8')).toBe(source)
    await fixture.channel.close()
  })

  it('creates missing config, reads provenance and rejects stale hashes without changing bytes', async () => {
    const fixture = await project()
    await fixture.request('histoire:ui:config-read', { paths: ['responsivePresets'] })
    expect(fixture.messages.at(-1).paths.responsivePresets.status).toBe('absent')
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'responsivePresets', value: [{ label: 'Phone', width: 390 }] }] })
    expect(fixture.messages.at(-1).saved).toEqual(['responsivePresets'])
    const before = await readFile(fixture.file, 'utf8')
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'responsivePresets', value: [] }], expectedHash: '0'.repeat(64) })
    expect(fixture.messages.at(-1).error).toContain('conflict')
    expect(await readFile(fixture.file, 'utf8')).toBe(before)
    await fixture.channel.close()
  })

  it('saves project defaults with Auto heights and an added viewport through the config channel', async () => {
    const fixture = await project('export default { theme: { title: "Preset project" } }\n')
    const defaults = getDefaultConfig()
    const presets = createPresetConfigStore({ config: () => defaults })
    presets.addViewport({ label: 'Custom Auto', width: 1440, height: null })
    const value = JSON.parse(JSON.stringify(presets.responsivePresets.value))
    expect(value.find(preset => preset.label === 'Desktop').height).toBeNull()
    await fixture.request('histoire:ui:config-read', { paths: ['responsivePresets'] })
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'responsivePresets', value }], expectedHash: fixture.messages.at(-1).hash })
    expect(fixture.messages.at(-1).saved).toEqual(['responsivePresets'])
    const loaded = await loadConfigFile(fixture.file)
    expect(loaded.responsivePresets).toEqual([...defaults.responsivePresets, { label: 'Custom Auto', width: 1440, height: null }])
    expect(loaded.theme.title).toBe('Preset project')
    await fixture.channel.close()
  })

  it('refuses computed config and preserves source when changed config fails to load', async () => {
    const code = `import backgrounds from './backgrounds.js'\nexport default { backgroundPresets: backgrounds }\n`
    const fixture = await project(code)
    const hash = await configFileHash(fixture.file, { root: fixture.root })
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'backgroundPresets', value: [] }], expectedHash: hash })
    expect(fixture.messages.at(-1).saved).toBeUndefined()
    expect(await readFile(fixture.file, 'utf8')).toBe(code)
    await writeFile(fixture.file, `throw new Error('PRIVATE SECRET')\nexport default { responsivePresets: [] }\n`)
    const broken = await readFile(fixture.file, 'utf8')
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'responsivePresets', value: [{ label: 'Phone', width: 400 }] }], expectedHash: await configFileHash(fixture.file, { root: fixture.root }) })
    expect(fixture.messages.at(-1).error).toBe('Config file failed to load; original file was preserved.')
    expect(fixture.messages.at(-1).error).not.toContain('PRIVATE SECRET')
    expect(await readFile(fixture.file, 'utf8')).toBe(broken)
    await fixture.channel.close()
  })

  it('restores session backup if config only fails under its final filename', async () => {
    const original = `const config = { ui: { defaultArrange: 'grid' } }
if (config.ui.defaultArrange === 'list' && import.meta.url.endsWith('/histoire.config.ts')) throw new Error('Private failure')
export default config
`
    const fixture = await project(original)
    await fixture.request('histoire:ui:config-save', { patches: [{ path: 'ui.defaultArrange', value: 'list' }], expectedHash: await configFileHash(fixture.file, { root: fixture.root }) })
    expect(fixture.messages.at(-1).error).toBe('Config file failed to load; original file was preserved.')
    expect(await readFile(fixture.file, 'utf8')).toBe(original)
    await fixture.channel.close()
  })
})
