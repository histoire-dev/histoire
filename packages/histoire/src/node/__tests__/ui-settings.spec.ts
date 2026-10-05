import { describe, expect, it, vi } from 'vitest'
import { createConfigSnippet, previewConfigValueDiff } from '../../../../histoire-app/src/app/components/pages/settings/project-config-preview.js'
import { createPresetConfigStore } from '../../../../histoire-app/src/app/stores/presets-config.js'
import { createProjectConfigStore } from '../../../../histoire-app/src/app/stores/project-config.js'
import { createUiSettingsStore, normalizeSettingsSection } from '../../../../histoire-app/src/app/stores/settings.js'
import { memoryStorage } from './utils/settings-storage.js'

describe('settings ownership', () => {
  it('uses project defaults, isolates local preferences and discards corrupt settings', () => {
    const storage = memoryStorage()
    storage.setItem('_histoire-ui-settings', '{bad')
    const warning = vi.fn()
    const first = createUiSettingsStore({ storage, warn: warning })
    const second = createUiSettingsStore({})
    expect(warning).toHaveBeenCalledOnce()
    first.update({ density: 'compact', syncZoom: true })
    expect(first.state).toMatchObject({ density: 'compact', syncZoom: true })
    expect(second.state.density).toBe('comfortable')
    expect(JSON.parse(storage.getItem('_histoire-ui-settings')!)).toEqual(first.state)
  })

  it('normalizes missing, unknown and unavailable static sections', () => {
    expect(normalizeSettingsSection('unknown', true)).toBe('appearance')
    expect(normalizeSettingsSection(undefined, true)).toBe('appearance')
    for (const section of ['tests', 'mcp', 'agents']) expect(normalizeSettingsSection(section, false)).toBe('appearance')
    expect(normalizeSettingsSection('viewports', false)).toBe('viewports')
  })

  it('restores compact density while denied storage and another owner retain usable defaults', () => {
    const storage = memoryStorage()
    const first = createUiSettingsStore({ storage })
    first.update({ density: 'compact' })
    expect(createUiSettingsStore({ storage }).state.density).toBe('compact')
    const deny = () => {
      throw new Error('Storage denied')
    }
    const isolated = createUiSettingsStore({ storage: { getItem: deny, setItem: deny, removeItem: deny }, warn: vi.fn() })
    expect(isolated.state.density).toBe('comfortable')
    isolated.update({ density: 'compact' })
    isolated.reset()
    expect(isolated.state.density).toBe('comfortable')
    expect(first.state.density).toBe('compact')
  })
})

describe('project preset overrides', () => {
  it('merges edits and removal by label, retains changed defaults and resets independently', () => {
    const storage = memoryStorage()
    const config = { responsivePresets: [{ label: 'Phone', width: 375, height: 667 }, { label: 'Desktop', width: 1280 }], backgroundPresets: [{ label: 'White', color: '#fff' }] }
    const presets = createPresetConfigStore({ storage, config: () => config })
    presets.updateViewport(0, { label: 'Phone', width: 390, height: 844 })
    presets.removeViewport(1)
    presets.addViewport({ label: 'Wide', width: 1920 })
    presets.updateBackground(0, { label: 'White', color: '#eee' })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Phone', width: 390, height: 844 }, { label: 'Wide', width: 1920 }])
    expect(createPresetConfigStore({ storage, config: () => config }).responsivePresets.value).toEqual(presets.responsivePresets.value)
    presets.resetViewports()
    expect(presets.responsivePresets.value).toEqual(config.responsivePresets)
    expect(presets.backgroundPresets.value).toEqual([{ label: 'White', color: '#eee' }])
    presets.resetBackgrounds()
    expect(presets.backgroundPresets.value).toEqual(config.backgroundPresets)
  })

  it('rejects invalid viewport dimensions before changing persisted presets', () => {
    const presets = createPresetConfigStore({ config: () => ({}) })
    expect(() => presets.addViewport({ label: 'Invalid', width: -1 })).toThrow('Viewport width must be positive')
    expect(() => presets.addViewport({ label: 'Invalid height', width: 320, height: 0 })).toThrow('Viewport height must be positive')
    expect(presets.responsivePresets.value).toEqual([])
  })

  it('keeps renamed project rows when their original labels are reused by new presets', () => {
    const storage = memoryStorage()
    const config = { responsivePresets: [{ label: 'Phone', width: 375 }], backgroundPresets: [{ label: 'White', color: '#fff' }] }
    const presets = createPresetConfigStore({ storage, config: () => config })
    presets.updateViewport(0, { label: 'Mobile', width: 390 })
    presets.addViewport({ label: 'Phone', width: 320 })
    presets.updateBackground(0, { label: 'Light', color: '#eee' })
    presets.addBackground({ label: 'White', color: '#fafafa' })
    const restored = createPresetConfigStore({ storage, config: () => config })
    expect(restored.responsivePresets.value).toEqual([{ label: 'Mobile', width: 390 }, { label: 'Phone', width: 320 }])
    expect(restored.backgroundPresets.value).toEqual([{ label: 'Light', color: '#eee' }, { label: 'White', color: '#fafafa' }])
    restored.removeViewport(1)
    restored.removeBackground(0)
    expect(restored.responsivePresets.value).toEqual([{ label: 'Mobile', width: 390 }])
    expect(restored.backgroundPresets.value).toEqual([{ label: 'White', color: '#fafafa' }])
    restored.resetViewports()
    restored.resetBackgrounds()
    expect(restored.responsivePresets.value).toEqual(config.responsivePresets)
    expect(restored.backgroundPresets.value).toEqual(config.backgroundPresets)
  })

  it('migrates local additions and retains independent identity after repeated rename and reuse', () => {
    const storage = memoryStorage()
    storage.setItem('_histoire-ui-viewports', JSON.stringify([{ label: 'Phone', value: { label: 'Mobile', width: 390 } }, { label: 'Wide', value: { label: 'Wide', width: 1920 } }]))
    const config = { responsivePresets: [{ label: 'Phone', width: 375 }] }
    const presets = createPresetConfigStore({ storage, config: () => config })
    presets.updateViewport(1, { label: 'Large', width: 1600 })
    presets.addViewport({ label: 'Wide', width: 1280 })
    presets.addViewport({ label: 'Phone', width: 320 })
    expect(createPresetConfigStore({ storage, config: () => config }).responsivePresets.value.map(item => item.label)).toEqual(['Mobile', 'Large', 'Wide', 'Phone'])
  })

  it('keeps captured source and local owners stable through removals and default reordering', () => {
    let config = {
      responsivePresets: [{ label: 'Phone', width: 375 }, { label: 'Tablet', width: 768 }, { label: 'Desktop', width: 1280 }],
      backgroundPresets: [{ label: 'White', color: '#fff' }, { label: 'Gray', color: '#888' }, { label: 'Black', color: '#000' }],
    }
    const presets = createPresetConfigStore({ config: () => config })
    const tablet = presets.viewportOwner(1)!
    const gray = presets.backgroundOwner(1)!
    presets.removeViewport(0)
    presets.removeBackground(0)
    presets.updateViewport(tablet, { label: 'Tablet revised', width: 800 })
    presets.updateBackground(gray, { label: 'Gray revised', color: '#999' })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Tablet revised', width: 800 }, { label: 'Desktop', width: 1280 }])
    expect(presets.backgroundPresets.value).toEqual([{ label: 'Gray revised', color: '#999' }, { label: 'Black', color: '#000' }])

    const desktop = presets.viewportOwner(1)!
    const black = presets.backgroundOwner(1)!
    config = {
      ...config,
      responsivePresets: [...config.responsivePresets].reverse(),
      backgroundPresets: [...config.backgroundPresets].reverse(),
    }
    presets.updateViewport(desktop, { label: 'Wide desktop', width: 1440 })
    presets.updateBackground(black, { label: 'Ink', color: '#111' })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Wide desktop', width: 1440 }, { label: 'Tablet revised', width: 800 }])
    expect(presets.backgroundPresets.value).toEqual([{ label: 'Ink', color: '#111' }, { label: 'Gray revised', color: '#999' }])

    presets.addViewport({ label: 'Local viewport', width: 1024 })
    presets.addBackground({ label: 'Local background', color: '#ccc' })
    const localViewport = presets.viewportOwner(2)!
    const localBackground = presets.backgroundOwner(2)!
    config = {
      ...config,
      responsivePresets: [...config.responsivePresets].reverse(),
      backgroundPresets: [...config.backgroundPresets].reverse(),
    }
    presets.updateViewport(localViewport, { label: 'Local viewport revised', width: 1200 })
    presets.updateBackground(localBackground, { label: 'Local background revised', color: '#ddd' })
    expect(presets.responsivePresets.value).toEqual([{ label: 'Tablet revised', width: 800 }, { label: 'Wide desktop', width: 1440 }, { label: 'Local viewport revised', width: 1200 }])
    expect(presets.backgroundPresets.value).toEqual([{ label: 'Gray revised', color: '#999' }, { label: 'Ink', color: '#111' }, { label: 'Local background revised', color: '#ddd' }])

    presets.removeViewport(1)
    presets.removeBackground(1)
    expect(() => presets.updateViewport(desktop, { label: 'Unsafe', width: 1600 })).toThrow('Preset no longer exists')
    expect(() => presets.updateBackground(black, { label: 'Unsafe', color: '#000' })).toThrow('Preset no longer exists')
  })
})

describe('project config client', () => {
  it('binds explicit saves to revision, rereads conflicts and ignores replies after close', () => {
    let receive: (value: any) => void = () => {}
    const send = vi.fn(() => true)
    const unsubscribe = vi.fn()
    const store = createProjectConfigStore({
      send,
      subscribe: (callback) => {
        receive = callback
        return unsubscribe
      },
    })
    store.read(['responsivePresets'])
    receive({ hash: 'revision', paths: { responsivePresets: { status: 'editable' } } })
    expect(send).toHaveBeenLastCalledWith('histoire:ui:config-read', { paths: ['responsivePresets'] })
    store.save([{ path: 'responsivePresets', value: [] }])
    expect(send).toHaveBeenLastCalledWith('histoire:ui:config-save', { patches: [{ path: 'responsivePresets', value: [] }], expectedHash: 'revision', requestId: expect.any(String) })
    receive({ requestId: send.mock.lastCall?.[1].requestId, completion: 'failed', hash: 'new', paths: {}, error: 'Config conflict: file changed on disk.' })
    expect(send).toHaveBeenLastCalledWith('histoire:ui:config-read', { paths: ['responsivePresets'] })
    store.close()
    receive({ hash: 'late', paths: {} })
    expect(store.state.value.hash).toBe('new')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('copies valid nested config and limits preview to changed lines with context', () => {
    const snippet = createConfigSnippet('theme.defaultColorScheme', 'dark')
    expect(snippet).toContain('"theme": {')
    expect(snippet).toContain('"defaultColorScheme": "dark"')
    expect(snippet).not.toContain('theme.defaultColorScheme:')
    const before = Array.from({ length: 100 }, (_, index) => ({ label: `Size ${index}`, width: 100 + index }))
    const after = before.map(item => ({ ...item }))
    after[50].width = 600
    const preview = previewConfigValueDiff('responsivePresets', before, after)
    expect(preview).toContain('-     "width": 150')
    expect(preview).toContain('+     "width": 600')
    expect(preview).not.toContain('Size 0')
    expect(preview.split('\n').length).toBeLessThan(20)
  })
})
