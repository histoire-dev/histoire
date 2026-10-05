// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('native package import contract', () => {
  it('imports built native components and peer controls with browser globals absent', () => {
    const source = `
      for (const name of ['window','document','navigator','HTMLElement']) delete globalThis[name];
      const native = await import('@histoire/vue');
      const controls = await import('@histoire/controls/vue');
      if(!native.HistoireProvider || !native.HistoirePreview || !native.HistoireDocs || !native.HistoireSource || !controls.HstText) throw new Error('missing exports');
      console.log('SSR-safe');`
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' })
    expect(output.trim()).toBe('SSR-safe')
  })
})
