import { describe, expect, it } from 'vitest'
import { HstDesigns } from '../index.js'

// Public factory must work in Node without evaluating browser modules.
describe('hstDesigns configuration', () => {
  it('ships the workbench client entry with default browser options', () => {
    const plugin = HstDesigns()
    expect(plugin.workbench).toMatchObject({ id: 'designs', apiVersion: 1, devOnly: false, options: { embedHost: 'histoire', canvasView: true } })
    expect(plugin.workbench?.client).toMatch(/client\.js$/)
    expect(plugin.workbench?.frame).toBeUndefined()
  })

  it('passes explicit options and can be disabled', () => {
    expect(HstDesigns({ embedHost: 'acme', canvasView: false, devOnly: true }).workbench).toMatchObject({ devOnly: true, options: { embedHost: 'acme', canvasView: false } })
    expect(HstDesigns({ enabled: false }).workbench).toBeUndefined()
  })

  it('rejects an empty embed host', () => {
    expect(() => HstDesigns({ embedHost: ' ' })).toThrow('embedHost')
  })
})
