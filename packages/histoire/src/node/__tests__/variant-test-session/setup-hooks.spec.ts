import type { Context } from '../../context.js'
import { describe, expect, it } from 'vitest'
import { resolvedGeneratedGlobalSetup } from '../../virtual/resolved-generated-global-setup.js'
import { generatedKnownEmptySetupProbe, hasVanillaSetupHooks } from '../../virtual/variant-test-session/setup-hooks.js'

describe('generated global setup hook metadata', () => {
  it('exports false when no generated setup code exists', () => {
    const source = resolvedGeneratedGlobalSetup({
      config: {},
      supportPlugins: [],
    } as unknown as Context)

    expect(source).toBe('export const hasSetupVanilla = false')
  })

  it('distinguishes actual vanilla hooks from the always-present setup wrapper', () => {
    const source = resolvedGeneratedGlobalSetup({
      config: { setupCode: ['./vue-setup.ts'] },
      supportPlugins: [{ setupFn: 'setupVanilla' }],
    } as unknown as Context)

    expect(source).toContain('const setupList = [setup_0]')
    expect(source).toContain('export const hasSetupVanilla = setupList.some(setup => typeof setup?.setupVanilla === \'function\')')
    expect(source).toContain('export async function setupVanilla')
  })

  it('reports no vanilla hook for an empty generated setup list', () => {
    const source = resolvedGeneratedGlobalSetup({
      config: { setupCode: [] },
      supportPlugins: [{ setupFn: 'setupVanilla' }],
    } as unknown as Context)

    expect(source).toContain('const setupList = []')
    expect(source).toContain('export const hasSetupVanilla = setupList.some(setup => typeof setup?.setupVanilla === \'function\')')
  })

  it('allows Vue-only setup and blocks configured or generated vanilla hooks', () => {
    expect(hasVanillaSetupHooks({ hasSetupVanilla: false }, { setupVue3() {} })).toBe(false)
    expect(hasVanillaSetupHooks({ hasSetupVanilla: false }, { setupVanilla() {} })).toBe(true)
    expect(hasVanillaSetupHooks({ hasSetupVanilla: true }, { setupVue3() {} })).toBe(true)
    expect(hasVanillaSetupHooks(undefined, { setupVue3() {} })).toBe(true)
  })

  it('imports setup modules sequentially and falls back when either import fails', () => {
    const probe = generatedKnownEmptySetupProbe()

    expect(probe.indexOf('import(\'virtual:$histoire-generated-global-setup\')'))
      .toBeLessThan(probe.indexOf('import(\'virtual:$histoire-setup\')'))
    expect(probe).toContain('catch {')
    expect(probe).toContain('return false')
  })
})
