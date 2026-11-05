import type { MarketplaceManifest, MigrationOp } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { validateMarketplaceManifest } from '../../marketplace/manifest/index.js'
import { applyMigrations } from '../../marketplace/migrations/apply.js'
import { selectMigrations } from '../../marketplace/migrations/select.js'

const manifest: MarketplaceManifest = { displayName: 'Test', summary: 'Test', category: 'testing', monogram: 'T', tint: 'blue', config: { import: 'TestPlugin' } }
/** Real source editor: target alias differs from unrelated call; callbacks must survive. */
function source(options: string): string {
  return `import { TestPlugin as Target } from 'test-plugin'\nimport { Other } from 'other'\nexport default { plugins: [Other({ figma: { token: 'keep' } }), Target(${options})], theme: { title: 'Keep' } }\n`
}
const ops: MigrationOp[] = [
  { op: 'rename-option', from: 'figma.token', to: 'figma.accessToken' },
  { op: 'remove-option', path: 'obsolete' },
  { op: 'set-option', path: 'report.enabled', value: true },
]

describe('declarative config migrations', () => {
  it('renames nested paths, removes and sets values while preserving unrelated source', () => {
    const input = source('{ figma: { token: \'secret\', project: \'keep\' }, obsolete: false, callback: () => 42 }')
    const output = applyMigrations(input, 'test-plugin', manifest, ops)
    expect(output).toContain('Other({ figma: { token: \'keep\' } })')
    expect(output).toContain('project: \'keep\'')
    expect(output).toContain('accessToken: \'secret\'')
    expect(output).not.toContain('obsolete:')
    expect(output).toContain('enabled: true')
    expect(output).toContain('callback: () => 42')
    expect(output).toContain('theme: { title: \'Keep\' }')
    expect(applyMigrations(output, 'test-plugin', manifest, ops)).toBe(output)
  })

  it('applies release migrations oldest first and release-local operations in order', () => {
    const releases = [
      { version: '0.5.0', manifest: { ...manifest, migrations: [{ from: '<0.5.0', ops: [{ op: 'rename-option' as const, from: 'middle', to: 'final' }] }] } },
      { version: '0.3.0', manifest: { ...manifest, migrations: [{ from: '*', ops: [{ op: 'set-option' as const, path: 'excluded', value: true }] }] } },
      { version: '0.4.0', manifest: { ...manifest, migrations: [{ from: '<0.4.0', ops: [{ op: 'rename-option' as const, from: 'old', to: 'middle' }] }, { from: '>=1', ops: [{ op: 'set-option' as const, path: 'excluded', value: true }] }] } },
      { version: '0.6.0', manifest: { ...manifest, migrations: [{ from: '*', ops: [{ op: 'set-option' as const, path: 'excluded', value: true }] }] } },
    ]
    const selected = selectMigrations(releases, '0.3.0', '0.5.0')
    const result = applyMigrations(source('{ old: \'value\' }'), 'test-plugin', manifest, selected)
    expect(result).toContain('final: \'value\'')
    expect(result).not.toMatch(/old:|middle:|excluded:/)
    expect(selectMigrations(releases, '0.5.0', '0.3.0')).toEqual([])
  })

  it.each(['options', '{ figma: { token: getToken() } }', '{ figma: { token: \'old\', accessToken: \'new\' } }', '{ ...options }'])('refuses unsafe or conflicting options without running code: %s', (options) => {
    expect(() => applyMigrations(source(options), 'test-plugin', manifest, ops)).toThrow()
  })

  it('rejects unknown operations and unsafe option paths at manifest boundary', () => {
    const parsed = validateMarketplaceManifest({ ...manifest, migrations: [{ from: '*', ops: [{ op: 'execute', code: 'evil()' }] }, { from: '*', ops: [{ op: 'remove-option', path: '__proto__.x' }] }] })
    expect(parsed.manifest?.migrations ?? []).toEqual([])
    expect(parsed.diagnostics.length).toBeGreaterThan(0)
  })
})
