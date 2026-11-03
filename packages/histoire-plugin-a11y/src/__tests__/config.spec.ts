import { describe, expect, it } from 'vitest'
import { HstA11y } from '../index.js'

// Public factory must work in Node without evaluating browser or axe modules.
describe('hstA11y configuration', () => {
  it('ships static-capable actor entries and explicit browser options', () => {
    const plugin = HstA11y()
    expect(plugin.workbench).toMatchObject({ id: 'a11y', apiVersion: 1, devOnly: false, options: { autoRun: true, exclude: [], timeoutMs: 10000 } })
    expect(plugin.workbench?.client).toMatch(/client\.js$/)
    expect(plugin.workbench?.frame).toMatch(/frame\.js$/)
    expect(HstA11y({ test: true, build: true }).workbench?.options).toMatchObject({ tests: true, report: true })
  })

  it('registers tests only when enabled and preserves other setup', async () => {
    for (const options of [{}, { test: false }, { enabled: false, test: true }]) {
      const config: any = { plugins: [], setupCode: ['existing'] }
      await HstA11y(options).config?.(config, 'dev')
      expect(config.setupCode).toEqual(['existing'])
    }
    const config: any = { plugins: [{ supportPlugin: { setupFn: ['setupSvelte4', 'setupSvelte5'] } }], setupCode: ['existing'] }
    await HstA11y({ test: true, devOnly: true }).config?.(config, 'dev')
    expect(config.setupCode).toHaveLength(2)
    expect(config.setupCode[0]).toBe('existing')
    for (const name of ['setupSvelte4', 'setupSvelte5', 'setupVanilla']) expect(config.setupCode[1]).toContain(name)
  })

  it('omits automatic tests from static books without changing CLI opt-in', async () => {
    const config: any = { plugins: [], setupCode: ['existing'] }
    await HstA11y({ test: true }).config?.(config, 'build')
    expect(config.setupCode).toEqual(['existing'])
  })

  it.each([0, -1, 30001, Number.NaN])('rejects invalid deadline %s', (timeoutMs) => {
    expect(() => HstA11y({ timeoutMs })).toThrow('timeoutMs')
  })
})
