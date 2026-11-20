import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateOfficialIndex, officialLogoUrl } from '../../../../../../scripts/marketplace/generate-official-index.mjs'
import { validateMarketplaceManifest } from '../../marketplace/manifest/index.js'

/** Full declarative input; invalid cases retain unrelated valid fields. */
function fullManifest() {
  return {
    displayName: 'Audit',
    summary: 'Audit story content',
    category: 'testing',
    frameworks: ['vue'],
    requires: { histoire: '>=1.0.0' },
    monogram: 'Ax',
    tint: 'blue',
    logoUrl: 'https://example.com/audit.svg',
    adds: [{ kind: 'story-tests', text: 'Audit each variant' }],
    access: ['story-dom'],
    config: { import: 'HstAudit', options: [
      { key: 'test', label: 'Run tests', type: 'boolean', default: false },
      { key: 'rules', label: 'Rules', type: 'enum', display: 'segmented', choices: [{ value: 'aa', label: 'AA' }], default: 'aa', when: { test: true } },
      { key: 'skip', label: 'Skip selectors', type: 'string-list', default: [] },
      { key: 'name', label: 'Name', type: 'string', default: '' },
    ] },
    recommend: [{ dependency: 'vitest', reason: 'Vitest detected' }, { missing: true, reason: 'No audits installed' }],
    collections: ['testing'],
    releaseNotes: [{ kind: 'breaking', text: 'Renamed option', code: ['old', 'new'] }],
    migrations: [{ from: '<1.0.0', ops: [{ op: 'rename-option', from: 'old', to: 'new' }, { op: 'remove-option', path: 'unused' }, { op: 'set-option', path: 'test', value: true }] }],
  }
}

describe('marketplace manifest', () => {
  it('retains a full valid manifest without mutating caller input', () => {
    const input = fullManifest()
    const before = structuredClone(input)
    expect(validateMarketplaceManifest(input)).toEqual({ manifest: before, diagnostics: [] })
    expect(input).toEqual(before)
  })

  it.each([
    ['logoUrl', 'http://example.com/logo.svg'],
    ['frameworks', [2]],
    ['access', ['unknown']],
    ['adds', [{ kind: 'unknown', text: 'Invalid' }]],
    ['recommend', [{ dependency: 'vitest', reason: 3 }]],
    ['collections', [false]],
    ['releaseNotes', [{ kind: 'unknown', text: 'Invalid' }]],
    ['requires', { histoire: 3 }],
    ['unexpected', 'discard me'],
  ])('drops invalid %s with a path diagnostic and preserves valid content', (key, value) => {
    const result = validateMarketplaceManifest({ ...fullManifest(), [key]: value })
    expect(result.manifest?.displayName).toBe('Audit')
    expect(result.diagnostics.some(diagnostic => diagnostic.path.startsWith(key))).toBe(true)
    if (Array.isArray(value)) expect(result.manifest?.[key]).toEqual([])
    else expect(result.manifest).not.toHaveProperty(key)
  })

  it('keeps valid siblings when dropping an invalid array item', () => {
    const result = validateMarketplaceManifest({ ...fullManifest(), adds: [
      { kind: 'inspector-tab', text: 'Audit inspector' },
      { kind: 'unknown', text: 'Invalid' },
      { kind: 'story-tests', text: 'Audit tests' },
    ] })
    expect(result.manifest?.adds).toEqual([{ kind: 'inspector-tab', text: 'Audit inspector' }, { kind: 'story-tests', text: 'Audit tests' }])
    expect(result.diagnostics).toEqual([expect.objectContaining({ path: 'adds.1.kind' })])
  })

  it('retains explicit local contribution ids without requiring a known registration', () => {
    const adds = [{ kind: 'rail-pane', text: 'Results', contribution: 'future/pane.v2' }]
    expect(validateMarketplaceManifest({ ...fullManifest(), adds })).toMatchObject({ manifest: { adds }, diagnostics: [] })
  })

  it.each(['', 'a11y:results', 'bad id', 'bad\nline', 42])('drops malformed contribution %j while preserving its description', (contribution) => {
    const result = validateMarketplaceManifest({ ...fullManifest(), adds: [{ kind: 'rail-pane', text: 'Results', contribution }] })
    expect(result.manifest?.adds).toEqual([{ kind: 'rail-pane', text: 'Results' }])
    expect(result.diagnostics).toEqual([expect.objectContaining({ path: 'adds.0.contribution' })])
  })

  it('keeps the factory when optional config fields are malformed or unknown', () => {
    const result = validateMarketplaceManifest({ ...fullManifest(), config: { import: 'HstAudit', options: 'code', run: 'never execute' } })
    expect(result.manifest?.config).toEqual({ import: 'HstAudit' })
    expect(result.diagnostics.map(diagnostic => diagnostic.path).sort()).toEqual(['config.options', 'config.run'])
  })

  it.each([['displayName', 40], ['summary', 160], ['monogram', 500]])('enforces %s string limit', (key, limit) => {
    expect(validateMarketplaceManifest({ ...fullManifest(), [key]: 'x'.repeat(limit) }).diagnostics).toEqual([])
    expect(validateMarketplaceManifest({ ...fullManifest(), [key]: 'x'.repeat(limit + 1) }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path: key })]))
  })

  it.each([null, [], 42, 'code'])('rejects a non-object manifest without throwing', (input) => {
    expect(validateMarketplaceManifest(input)).toEqual({ manifest: undefined, diagnostics: [expect.objectContaining({ path: '' })] })
  })

  it('rejects unknown tint and incomplete required metadata', () => {
    expect(validateMarketplaceManifest({ ...fullManifest(), tint: 'neon' }).manifest).toBeUndefined()
    expect(validateMarketplaceManifest({ summary: 'Incomplete' }).manifest).toBeUndefined()
  })

  it('drops invalid option types, defaults, unknown dependencies and unsafe migration paths', () => {
    const input = fullManifest()
    const result = validateMarketplaceManifest({ ...input, config: { import: 'HstAudit', options: [
      ...input.config.options,
      { key: 'bad', label: 'Bad', type: 'function' },
      { key: 'wrong', label: 'Wrong', type: 'boolean', default: 'yes' },
      { key: 'dependent', label: 'Dependent', type: 'string', when: { unknown: true } },
    ] }, migrations: [{ from: '<1.0.0', ops: [{ op: 'rename-option', from: '__proto__.value', to: 'safe' }] }] })
    expect(result.manifest?.config.options).toEqual(input.config.options)
    expect(result.manifest?.migrations).toEqual([])
    expect(result.diagnostics.map(diagnostic => diagnostic.path)).toEqual(expect.arrayContaining([
      'config.options.4.type',
      'config.options.5.default',
      'config.options.6.when.unknown',
      'migrations.0.ops.0.from',
    ]))
  })

  // Defect: a bundled logo carrying script, styles or remote references would run or fetch in the workbench.
  it('accepts only self-contained monochrome logo markup', () => {
    expect(officialLogoUrl('<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>', 'x')).toMatch(/^data:image\/svg\+xml;base64,/)
    for (const svg of ['<svg><script>alert(1)</script></svg>', '<svg><image href="https://a.test/x.png"/></svg>', '<svg onload="x()"></svg>', '<svg><style>*{}</style></svg>', '<div></div>']) {
      expect(() => officialLogoUrl(svg, 'x'), svg).toThrow('Invalid official logo')
    }
  })

  it('validates all ten official manifests and detects bundled-index drift', async () => {
    const root = fileURLToPath(new URL('../../../../../../', import.meta.url))
    const generated = await generateOfficialIndex(root)
    expect(generated).toHaveLength(10)
    for (const entry of generated) {
      expect(validateMarketplaceManifest(entry.manifest).diagnostics, entry.id).toEqual([])
      expect(entry.history.length).toBeLessThanOrEqual(50)
      expect(entry.versions).toEqual(entry.history.map(release => ({ version: release.version, ...(release.publishedAt ? { date: release.publishedAt } : {}), compatible: true })))
      expect(entry.official).toBe(true)
      expect(entry.id.startsWith('@histoire/')).toBe(true)
      expect(entry.logoUrl, entry.id).toMatch(/^data:image\/svg\+xml;base64,/)
    }
    const bundled = JSON.parse(await readFile(new URL('../../marketplace/catalog/official.json', import.meta.url), 'utf8'))
    expect(bundled).toEqual(generated)
    expect(generated.map(entry => entry.id)).toEqual(generated.map(entry => entry.id).sort())
  })
})
