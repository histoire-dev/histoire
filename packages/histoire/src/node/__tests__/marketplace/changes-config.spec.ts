import type { MarketplaceManifest } from '@histoire/shared'
import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { hashConfigCode, writeConfig } from '../../config/codemod/write.js'
import { loadConfigFile } from '../../config/load.js'
import { analyzePluginSource, disablePluginEntry } from '../../config/plugin-toggle-source.js'
import { editPluginConfig } from '../../marketplace/changes/config-edit.js'
import { fileDiff } from '../../marketplace/changes/diff.js'
import shapes from '../fixtures/marketplace/configs/shapes.json'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'

const manifest: MarketplaceManifest = {
  displayName: 'Test',
  summary: 'Test plugin',
  category: 'testing',
  monogram: 'T',
  tint: 'blue',
  config: { import: 'TestPlugin', options: [
    { key: 'test', label: 'Tests', type: 'boolean', default: false },
    { key: 'nested.mode', label: 'Mode', type: 'string', default: 'normal' },
  ] },
}
const id = 'test-plugin'
afterEach(disposeConfigProjects)

// Boundary: real parser/editor + loader/writer. Independent loaded values reject
// no-op edits, dropped unrelated values, duplicate calls, or default leakage.
describe('marketplace config edits', () => {
  it.each(['empty', 'array', 'entries', 'plain'] as const)('inserts into %s without changing unrelated entries', (shape) => {
    const output = editPluginConfig(shapes[shape], { kind: 'install', id, options: { 'test': false, 'nested.mode': 'strict' } }, manifest)
    const entries = analyzePluginSource(output)
    expect(entries.map(entry => entry.expression)).toEqual(shape === 'entries' ? ['Other()', 'TestPlugin({ nested: { mode: \'strict\' } })'] : ['TestPlugin({ nested: { mode: \'strict\' } })'])
    expect(output.match(/import \{ TestPlugin \} from 'test-plugin'/g)).toHaveLength(1)
    if (shape === 'entries') expect(output).toContain('theme: { title: \'Kept\' }')
    expect(editPluginConfig(output, { kind: 'install', id, options: { 'nested.mode': 'strict' } }, manifest)).toBe(output)
  })

  it.each(['variable', 'spread'] as const)('refuses %s arrays without executing them', (shape) => {
    expect(() => editPluginConfig(shapes[shape], { kind: 'install', id }, manifest)).toThrow()
  })

  it('keeps aliases, unrelated options and shared import uses', () => {
    const code = 'import { TestPlugin as Custom, Helper } from \'test-plugin\'\nexport default { plugins: [Custom({ test: true, nested: { mode: \'old\', keep: 42 }, callback: () => 7 })], other: Helper, shared: Custom }\n'
    const output = editPluginConfig(code, { kind: 'options', id, options: { 'test': false, 'nested.mode': 'new' } }, manifest)
    expect(output).toContain('nested: { mode: \'new\', keep: 42 }')
    expect(output).toContain('callback: () => 7')
    expect(output).not.toContain('test: true')
    const removed = editPluginConfig(output, { kind: 'remove', id }, manifest)
    expect(analyzePluginSource(removed)).toEqual([])
    expect(removed).toContain('TestPlugin as Custom')
    expect(removed).toContain('Helper')
  })

  it('removes disabled entries and only unused import specifiers', () => {
    const code = 'import { TestPlugin, Helper } from \'test-plugin\'\nimport { Other } from \'other-plugin\'\nexport default { plugins: [TestPlugin(), Other()], helper: Helper }\n'
    const disabled = disablePluginEntry(code, analyzePluginSource(code)[0], { name: id, client: true, frame: false })
    const output = editPluginConfig(disabled, { kind: 'remove', id }, manifest)
    expect(analyzePluginSource(output).map(entry => entry.expression)).toEqual(['Other()'])
    expect(output).not.toContain('TestPlugin')
    expect(output).toContain('Helper')
    expect(output).not.toContain('histoire-plugin:')
  })

  it('removes sole named factory beside a default import and refuses duplicate aliases', () => {
    const code = 'import Default, { TestPlugin } from \'test-plugin\'\nexport default { plugins: [TestPlugin()], other: Default }\n'
    const removed = editPluginConfig(code, { kind: 'remove', id }, manifest)
    expect(analyzePluginSource(removed)).toEqual([])
    expect(removed).toContain('import Default from \'test-plugin\'')
    expect(removed).toContain('other: Default')
    const duplicate = 'import { TestPlugin as A, TestPlugin as B } from \'test-plugin\'\nexport default { plugins: [A(), B()] }'
    expect(() => editPluginConfig(duplicate, { kind: 'remove', id }, manifest)).toThrow()
  })

  it('does not create an empty plugins array when removing an unconfigured package', () => {
    expect(editPluginConfig(shapes.plain, { kind: 'remove', id }, manifest)).toBe(shapes.plain)
    const unused = 'import { TestPlugin } from \'test-plugin\'\nexport default {}\n'
    expect(editPluginConfig(unused, { kind: 'remove', id }, manifest)).toBe(shapes.plain)
  })

  it('avoids binding collisions and rejects ambiguous or computed options', () => {
    const output = editPluginConfig('const TestPlugin = 1\nexport default { plugins: [], value: TestPlugin }', { kind: 'install', id }, manifest)
    expect(output).toContain('TestPlugin as TestPlugin2')
    expect(analyzePluginSource(output)[0].expression).toBe('TestPlugin2()')
    expect(() => editPluginConfig('import { TestPlugin } from \'test-plugin\'\nexport default { plugins: [TestPlugin(getOptions())] }', { kind: 'options', id, options: { test: true } }, manifest)).toThrow()
    expect(() => editPluginConfig(shapes.plain, { kind: 'install', id, options: { test: 'bad' } }, manifest)).toThrow()
  })

  it.each(['ts', 'js'])('loads edited %s config and diff equals exact writer bytes', async (extension) => {
    const { root, file } = await configTestProject(shapes.plain, `histoire.config.${extension}`)
    await writeFile(`${root}/plugin.mjs`, 'export function TestPlugin(options) { return { name: "test", options } }\n')
    const code = editPluginConfig(shapes.plain, { kind: 'install', id: './plugin.mjs', options: { test: true } }, manifest)
    const diff = fileDiff(`histoire.config.${extension}`, shapes.plain, code)
    await writeConfig(file, code, { root, expectedHash: hashConfigCode(shapes.plain) })
    expect(await readFile(file, 'utf8')).toBe(code)
    expect(`${diff.lines.filter(line => line.kind !== 'del').map(line => line.text).join('\n')}\n`).toBe(code)
    expect((await loadConfigFile(file)).plugins).toEqual([{ name: 'test', options: { test: true } }])
  })
})
