import { describe, expect, it } from 'vitest'
import { routeImportsThroughDynamicFacades } from '../build/mock-facades.js'

/** Minimal Rolldown output chunk shape read by the facade pass. */
function chunk(fileName: string, code: string, isDynamicEntry = false) {
  return { type: 'chunk' as const, fileName, code, isDynamicEntry }
}

describe('dynamic facade import routing', () => {
  it('routes static importers of a facade inner chunk through the facade', () => {
    const bundle = {
      'assets/greeting-facade.js': chunk('assets/greeting-facade.js', 'export { t as getGreeting } from "./greeting-inner.js";\n', true),
      'assets/greeting-inner.js': chunk('assets/greeting-inner.js', '// src/greeting.ts\nfunction getGreeting(name) {}\nexport { getGreeting as t };\n'),
      'assets/Component.js': chunk('assets/Component.js', 'import { a as ref } from "./vendor.js";\nimport { t as getGreeting } from "./greeting-inner.js";\ngetGreeting(ref)\n'),
    }

    routeImportsThroughDynamicFacades(bundle)

    expect(bundle['assets/Component.js'].code).toBe('import { a as ref } from "./vendor.js";\nimport { getGreeting } from "./greeting-facade.js";\ngetGreeting(ref)\n')
    expect(bundle['assets/greeting-facade.js'].code).toBe('export { t as getGreeting } from "./greeting-inner.js";\n')
  })

  it('keeps inner bindings that no facade exposes and splits mixed imports', () => {
    const bundle = {
      'assets/a.js': chunk('assets/a.js', 'export { t as a } from "./shared.js";', true),
      'assets/nested/b.js': chunk('assets/nested/b.js', 'export { n as b } from "../shared.js";', true),
      'assets/shared.js': chunk('assets/shared.js', 'export { x as t, y as n, z as r };'),
      'assets/user.js': chunk('assets/user.js', 'import { n, r as other, t as first } from "./shared.js";'),
    }

    routeImportsThroughDynamicFacades(bundle)

    expect(bundle['assets/user.js'].code).toBe('import { r as other } from "./shared.js";import { b as n } from "./nested/b.js";import { a as first } from "./a.js";')
  })

  it('ignores chunks with own code and static entry facades', () => {
    const own = 'export { t as value } from "./inner.js";\nconsole.log(1)\n'
    const bundle = {
      'assets/own.js': chunk('assets/own.js', own, true),
      'assets/entry.js': chunk('assets/entry.js', 'export { t as value } from "./inner.js";'),
      'assets/user.js': chunk('assets/user.js', 'import { t as value } from "./inner.js";'),
    }

    routeImportsThroughDynamicFacades(bundle)

    expect(bundle['assets/user.js'].code).toBe('import { t as value } from "./inner.js";')
  })
})
