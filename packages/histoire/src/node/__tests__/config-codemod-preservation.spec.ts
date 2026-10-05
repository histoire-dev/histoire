import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeConfigPath, editConfig } from '../config/codemod/index.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('config source preservation boundaries', () => {
  it.each([
    'const { scheme } = { scheme: "dark" }',
    'const [scheme] = ["dark"]',
    'const { nested: { scheme } } = { nested: { scheme: "dark" } }',
  ])('refuses shadowed destructured binding: %s', async (declaration) => {
    const source = `const scheme = "light"; export default defineConfig(() => { ${declaration}; return { theme: { defaultColorScheme: scheme } } })`
    const { root, file } = await configTestProject(source)
    expect(await analyzeConfigPath(file, 'theme.defaultColorScheme', { root })).toMatchObject({ status: 'computed', reason: expect.stringContaining('destructured') })
    await expect(editConfig(file, [{ path: 'theme.defaultColorScheme', value: 'auto' }], { root })).rejects.toThrow('destructured')
    expect(await readFile(file, 'utf8')).toBe(source)
  })

  it('retains comment bytes when inserting into an empty inline object', async () => {
    const source = 'export default { /* Keep project note */ }\n'
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })
    expect(result.code).toBe('export default { /* Keep project note */ ui: { defaultArrange: \'list\' } }\n')
  })

  it.each([' /* Keep theme note */ ', ' // Keep theme note\n '])('recognizes trailing comma after comment trivia %j', async (trivia) => {
    const source = `export default { theme: {}${trivia}, }\n`
    const { root, file } = await configTestProject(source)
    const result = await editConfig(file, [{ path: 'ui.defaultArrange', value: 'list' }], { root })
    expect(result.code).toContain(`theme: {}${trivia},`)
    expect(result.code).toContain('ui: { defaultArrange: \'list\' }')
  })

  it('removes field punctuation while preserving comment before its comma', async () => {
    const { root, file } = await configTestProject('export default { responsivePresets: [] /* Keep preset note */, backgroundPresets: [] }')
    const result = await editConfig(file, [{ path: 'responsivePresets', value: undefined }], { root })
    expect(result.code).toBe('export default {  /* Keep preset note */ backgroundPresets: [] }')
  })
})
