import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { normalizeSettingsSection } from '../../../../histoire-app/src/app/stores/settings.js'
import { resolvedConfig } from '../virtual/resolved-config.js'

describe('installed plugin inventory', () => {
  it.each(['dev', 'build'] as const)('exposes only public identities in %s configuration', async (mode) => {
    const ctx = { mode, config: { plugins: [
      { name: 'builtin:vanilla-support' },
      { name: 'alpha', privateField: 'secret-one', workbench: { id: 'alpha', client: '/private/client.js', frame: '/private/frame.js', options: { secret: 'secret-two' } } },
      { name: 'alpha' },
    ] } } as unknown as Context
    const source = resolvedConfig(ctx)
    const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    expect(module.installedPlugins).toEqual([
      { name: 'builtin:vanilla-support', builtin: true, enabled: true, client: false, frame: false, local: false, required: true, official: false },
      { name: 'alpha', builtin: false, enabled: true, id: 'alpha', client: true, frame: true, local: true, required: false, official: false },
      { name: 'alpha', builtin: false, enabled: true, client: false, frame: false, local: true, required: false, official: false },
    ])
    expect(source).not.toContain('secret-one')
    expect(source).not.toContain('secret-two')
    expect(source).not.toContain('/private/')
  })

  it('accepts the Plugins settings route in both modes', () => {
    expect(normalizeSettingsSection('plugins', true)).toBe('plugins')
    expect(normalizeSettingsSection('plugins', false)).toBe('plugins')
  })

  it('does not advertise dev-only browser entries in a static book', async () => {
    const ctx = { mode: 'build', config: { plugins: [{ name: 'dev-tools', workbench: { id: 'tools', client: 'tools/client', frame: 'tools/frame', devOnly: true } }] } } as unknown as Context
    const module = await import(`data:text/javascript,${encodeURIComponent(resolvedConfig(ctx))}`)
    expect(module.installedPlugins).toEqual([{ name: 'dev-tools', builtin: false, enabled: true, id: 'tools', client: false, frame: false, local: true, required: false, official: false }])
  })

  it('emits resolved public metadata alongside the correct duplicate plugin', async () => {
    const ctx = { mode: 'dev', config: { plugins: [{ name: 'same' }, { name: 'same' }] }, pluginMetadata: [{ displayName: 'First' }, { description: 'Second' }] } as unknown as Context
    const module = await import(`data:text/javascript,${encodeURIComponent(resolvedConfig(ctx))}`)
    expect(module.installedPlugins).toEqual([
      { name: 'same', builtin: false, enabled: true, client: false, frame: false, displayName: 'First', local: true, required: false, official: false },
      { name: 'same', builtin: false, enabled: true, client: false, frame: false, description: 'Second', local: true, required: false, official: false },
    ])
  })
})
