import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeConfigPath } from '../config/codemod/analyze.js'
import { editConfig } from '../config/codemod/edit.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('config codemod', () => {
  it('preserves all bytes outside edited literals including comments and quotes', async () => {
    const source = await readFile(fileURLToPath(new URL('./fixtures/config-codemod/comments.txt', import.meta.url)), 'utf8')
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })
    expect(result.code).toBe(source.replace('defaultColorScheme: \'light\'', 'defaultColorScheme: \'dark\''))
    expect(result.changed).toEqual(['theme.defaultColorScheme'])
    expect(await readFile(file, 'utf8')).toBe(source)
  })

  it.each([
    'export default defineConfig({ ui: { defaultArrange: "grid" } });',
    'export default { ui: { defaultArrange: "grid" } }',
    'module.exports = { ui: { defaultArrange: "grid" } };',
    'const config = defineConfig({ ui: { defaultArrange: "grid" } }); export default config',
    'export default defineConfig(async () => ({ ui: { defaultArrange: "grid" } }))',
    'export default function () { return { ui: { defaultArrange: "grid" } } }',
    'export default defineConfig(function () { return { ui: { defaultArrange: "grid" } } })',
    'export default { ui: { defaultArrange: "grid" } } satisfies HistoireConfig',
  ])('edits supported shape: %s', async (source) => {
    const { root, file } = await configTestProject(source)
    expect(await analyzeConfigPath(file, 'ui.defaultArrange', { root })).toMatchObject({ status: 'editable' })
    expect((await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })).code)
      .toBe(source.replace('"grid"', '"list"'))
  })

  it('edits one local const initializer without replacing its references', async () => {
    const source = 'const scheme = "light"; export default { theme: { defaultColorScheme: scheme } }'
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })).code)
      .toBe(source.replace('"light"', '"dark"'))
  })

  it('resolves a literal const declared inside config factory', async () => {
    const source = 'export default defineConfig(() => { const scheme = "light"; return { theme: { defaultColorScheme: scheme } } })'
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })).code)
      .toBe(source.replace('"light"', '"dark"'))
  })

  it('resolves nearest factory-local literal before an imported name', async () => {
    const source = 'import { scheme } from "./settings"; export default defineConfig(() => { const scheme = "light"; return { theme: { defaultColorScheme: scheme } } })'
    const { root, file } = await configTestProject(source)
    expect(await analyzeConfigPath(file, 'theme.defaultColorScheme', { root })).toMatchObject({ status: 'editable' })
    expect((await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })).code)
      .toBe(source.replace('const scheme = "light"', 'const scheme = "dark"'))
  })

  it('refuses factory parameters that shadow imported names', async () => {
    const source = 'import { scheme } from "./settings"; export default defineConfig(scheme => ({ theme: { defaultColorScheme: scheme } }))'
    const { root, file } = await configTestProject(source)
    expect(await analyzeConfigPath(file, 'theme.defaultColorScheme', { root }))
      .toMatchObject({ status: 'computed', reason: expect.stringContaining('not a local const') })
  })

  it.each([
    ['import { presets } from "./presets"; export default { responsivePresets: presets }', 'imported value', 'computed'],
    ['export default { responsivePresets: getPresets() }', 'call', 'computed'],
    ['export default { responsivePresets: flag ? [] : [] }', 'conditional', 'computed'],
    ['export default { responsivePresets: `presets` }', 'template literal', 'computed'],
    ['export default { responsivePresets: () => [] }', 'function', 'function-only'],
    ['export default { ...base }', 'spread', 'computed'],
    ['export default { responsivePresets: [{ ...base, label: "Phone" }] }', 'spread', 'computed'],
    ['let presets = []; export default { responsivePresets: presets }', 'const', 'computed'],
    ['const a = []; const b = a; export default { responsivePresets: b }', 'binding', 'computed'],
    ['export default defineConfig(() => { if (flag) return {}; return {} })', 'function', 'computed'],
  ])('refuses computed shape: %s', async (source, reason, status) => {
    const { root, file } = await configTestProject(source)
    const result = await analyzeConfigPath(file, 'responsivePresets', { root })
    expect(result.status).toBe(status)
    expect(result.reason).toContain(reason)
    expect(result.reason).toContain('line 1')
    expect(result.location).toMatchObject({ line: 1 })
    await expect(editConfig(file, [{ path: 'responsivePresets', value: [] }], { root })).rejects.toThrow(reason)
  })

  it('refuses keys shadowed by later spreads and duplicate properties', async () => {
    for (const source of ['export default { responsivePresets: [], ...base }', 'export default { responsivePresets: [], responsivePresets: [] }']) {
      const { root, file } = await configTestProject(source)
      expect((await analyzeConfigPath(file, 'responsivePresets', { root })).status).toBe('computed')
    }
  })

  it('adds nested keys with existing indentation and quote style', async () => {
    const source = 'export default {\n\tbackgroundPresets: [],\n}\n'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'dark' }], { root })
    expect(result.code).toBe('export default {\n\tbackgroundPresets: [],\n\ttheme: { defaultColorScheme: \'dark\' },\n}\n')
    await writeFile(file, result.code)
    expect((await analyzeConfigPath(file, 'theme.defaultColorScheme', { root })).status).toBe('editable')
  })

  it('removes property and comma without touching sibling bytes', async () => {
    const source = 'export default {\n  responsivePresets: [],\n  backgroundPresets: [],\n}\n'
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'responsivePresets', value: undefined }], { root })).code)
      .toBe('export default {\n  backgroundPresets: [],\n}\n')
  })

  it('changes preset fields by label while retaining element comments', async () => {
    const source = 'export default { responsivePresets: [\n  { label: "Phone", width: 320, height: 640 }, // Keep Phone\n  { label: "Desktop", width: 1280, height: 800 },\n] }'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'responsivePresets', value: [
      { label: 'Phone', width: 375, height: 640 },
      { label: 'Desktop', width: 1280, height: 800 },
    ] }], { root })
    expect(result.code).toBe(source.replace('width: 320', 'width: 375'))
  })

  it('supports keyed agent presets and rejects secrets and unsafe paths', async () => {
    const source = 'export default { agents: { presets: [{ id: "helper", name: "Helper", command: "old" }] } }'
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'agents.presets[helper].command', value: 'new' }], { root })).code)
      .toBe(source.replace('"old"', '"new"'))
    for (const path of ['vite.plugins', 'agents.presets[helper].env', 'agents.__proto__', 'ui.frameBudget']) {
      await expect(editConfig(file, [{ path, value: {} }], { root })).rejects.toThrow('not editable')
    }
    await expect(editConfig(file, [{ path: 'agents.presets', value: [{ id: 'helper', env: { TOKEN: 'secret' } }] }], { root })).rejects.toThrow('env')
  })

  it('does not mark equal values or missing removals as changed', async () => {
    const source = 'export default { ui: { defaultArrange: "grid" } }'
    const { root, file } = await configTestProject(source)
    expect(await editConfig(file, [{ path: 'ui.defaultArrange', value: 'grid' }, { path: 'responsivePresets', value: undefined }], { root }))
      .toMatchObject({ code: source, changed: [] })
  })

  it('returns parser message and location without touching malformed source', async () => {
    const { root, file } = await configTestProject('export default { ui: ')
    expect(await analyzeConfigPath(file, 'ui.defaultArrange', { root })).toMatchObject({ status: 'computed', reason: expect.stringContaining('Unexpected token'), location: { line: 1, column: expect.any(Number) } })
    await expect(editConfig(file, [{ path: 'ui.defaultArrange', value: 'grid' }], { root })).rejects.toThrow('Unexpected token')
  })

  it.each(['\n', '\r\n'])('preserves tabs and %j while replacing an existing literal', async (newline) => {
    const source = ['export default {', '\tui: { defaultArrange: "grid" },', '}', ''].join(newline)
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })).code)
      .toBe(source.replace('"grid"', '"list"'))
    expect(await analyzeConfigPath(file, 'ui.defaultArrange', { root })).toMatchObject({ location: { line: 2, column: 8 } })
  })

  it('preserves quote style of a changed string in a mixed-quote file', async () => {
    const source = 'const a = \'a\'; const b = \'b\'; export default { ui: { defaultArrange: "grid" } }'
    const { root, file } = await configTestProject(source)
    expect((await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })).code)
      .toBe(source.replace('"grid"', '"list"'))
  })

  it('replaces object keys with additions and removals without overlapping ranges', async () => {
    const source = 'export default { agents: { permissions: { fileEdits: "ask", terminal: "ask" } } }'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'agents.permissions', value: { fileEdits: 'never', extra: 'ask' } }], { root })
    await writeFile(file, result.code)
    expect((await analyzeConfigPath(file, 'agents.permissions', { root })).status).toBe('editable')
    expect(result.code).toContain('extra: "ask"')
    expect(result.code).not.toContain('terminal:')
  })

  it('adds a missing keyed agent preset while creating literal parent objects', async () => {
    const { root, file } = await configTestProject('export default {}')
    const result = await editConfig(file, [{ path: 'agents.presets[helper].command', value: 'agent' }], { root })
    expect(result.code).toContain('presets: [{ id: \'helper\', command: \'agent\' }]')
  })

  it('refuses factory parameters which shadow otherwise literal outer bindings', async () => {
    const { root, file } = await configTestProject('const scheme = "light"; export default defineConfig(scheme => ({ theme: { defaultColorScheme: scheme } }))')
    expect((await analyzeConfigPath(file, 'theme.defaultColorScheme', { root })).status).toBe('computed')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, [undefined], new Date(), Object.assign([], { extra: true }), Array.from({ length: 2 })])('refuses non-JSON patch %j', async (value) => {
    const { root, file } = await configTestProject('export default {}')
    await expect(editConfig(file, [{ path: 'responsivePresets', value: value as never }], { root })).rejects.toThrow('JSON')
  })
})
