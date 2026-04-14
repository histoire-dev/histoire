import fs from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'

describe('vue variant implicit state sync', () => {
  it('seeds hidden mount variants from implicit state snapshots', () => {
    const componentPath = resolve(process.cwd(), '../histoire-plugin-vue/src/client/app/Variant.ts')
    const source = fs.readFileSync(componentPath, 'utf8')

    expect(source).toContain('renderContext?.mode !== \'render\' && mountVariant.value && implicitState')
    expect(source).toContain('applyState(mountVariant.value.state, toRawDeep(implicitState()))')
    expect(source).not.toContain('syncStateBundledAndExternal(mountVariant.value.state, implicitState())')
  })
})
