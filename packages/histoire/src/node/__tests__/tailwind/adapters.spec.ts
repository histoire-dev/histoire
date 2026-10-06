import { describe, expect, it } from 'vitest'
import { discoverTailwindSources, resolveTailwindEngine } from '../../builtin-plugins/tailwind/discovery.js'
import { generateTailwindSnapshot } from '../../builtin-plugins/tailwind/generate.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'
import { createTailwindFixture } from '../utils/tailwind.js'

describe('tailwind project adapters', () => {
  it('never borrows Histoire compiler for a project without Tailwind', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      expect(await resolveTailwindEngine(fixture.root)).toBeNull()
    }
    finally { await fixture.close() }
  })
  it('resolves v3 configuration and preserves nested colors, functions and typography', async () => {
    const fixture = await createTailwindFixture(3)
    try {
      await fixture.write('tailwind.config.ts', `export default {prefix:'ac-',theme:{colors:{brand:{DEFAULT:'#123456',deep:{500:'rgb(1 2 3 / <alpha-value>)'}},fn:({opacityValue})=>'rgb(1 2 3 / '+opacityValue+')'},fontSize:{plain:'12px',tuple:['20px',{lineHeight:'1.5',letterSpacing:'0.1em'}]},fontFamily:{sans:['Inter','sans-serif'],tuple:[['Inter','sans-serif'],{fontFeatureSettings:'"cv11"',fontVariationSettings:'"wght" 650'}],scalar:['Inter',{fontFeatureSettings:'"cv02"'}]}}}`)
      const engine = await resolveTailwindEngine(fixture.root)
      expect(engine.major).toBe(3)
      const sources = await discoverTailwindSources(fixture.api, engine, {})
      const result = await generateTailwindSnapshot(fixture.api, engine, sources[0], {})
      const color = result.snapshot.categories.find(c => c.id === 'background-color')!
      expect(color.tokens.find(t => t.key === 'brand')?.name).toBe('ac-bg-brand')
      expect(color.tokens.find(t => t.key === 'brand-deep-500')?.preview.backgroundColor).toBe('rgb(1 2 3 / 1)')
      expect(color.tokens.find(t => t.key === 'fn')?.preview.backgroundColor).toBe('rgb(1 2 3 / 1)')
      const fonts = result.snapshot.categories.find(c => c.id === 'font-size')!
      expect(fonts.tokens.find(t => t.key === 'plain')?.preview).toEqual({ fontSize: '12px' })
      expect(fonts.tokens.find(t => t.key === 'tuple')?.preview).toEqual({ fontSize: '20px', lineHeight: '1.5', letterSpacing: '0.1em' })
      const families = result.snapshot.categories.find(c => c.id === 'font-family')!
      expect(families.tokens.find(t => t.key === 'sans')?.preview).toEqual({ fontFamily: 'Inter, sans-serif' })
      expect(families.tokens.find(t => t.key === 'tuple')?.preview).toEqual({ fontFamily: 'Inter, sans-serif', fontFeatureSettings: '"cv11"', fontVariationSettings: '"wght" 650' })
      expect(families.tokens.find(t => t.key === 'tuple')?.value).toEqual([['Inter', 'sans-serif'], { fontFeatureSettings: '"cv11"', fontVariationSettings: '"wght" 650' }])
      expect(families.tokens.find(t => t.key === 'scalar')?.preview).toEqual({ fontFamily: 'Inter', fontFeatureSettings: '"cv02"' })
    }
    finally { await fixture.close() }
  })

  it('selects independent v4 roots, excludes imported partials, and preserves resets and prefix', async () => {
    const fixture = await createTailwindFixture(4)
    try {
      await fixture.write('src/colors.css', '@theme { --color-*: initial; --color-brand: #123456; --text-lg: 2rem; --text-lg--line-height: 1.5; }')
      await fixture.write('src/main.css', '@import "tailwindcss" prefix(tw); @import "./colors.css"; @theme { --spacing: 0.3rem; }')
      await fixture.write('src/admin.css', '@import "tailwindcss"; @theme { --color-brand: #abcdef; }')
      await fixture.write('src/reference.css', '@reference "./main.css";')
      const engine = await resolveTailwindEngine(fixture.root)
      expect(engine.major).toBe(4)
      const sources = await discoverTailwindSources(fixture.api, engine, {})
      expect(sources.map(s => s.relativePath)).toEqual(['src/admin.css', 'src/main.css'])
      const main = sources.find(s => s.relativePath === 'src/main.css')!
      const result = await generateTailwindSnapshot(fixture.api, engine, main, {})
      const colors = result.snapshot.categories.find(c => c.id === 'background-color')!
      expect(colors.tokens.map(t => t.name)).toContain('tw:bg-brand')
      expect(colors.tokens.map(t => t.name)).not.toContain('tw:bg-red-500')
      expect(colors.tokens.find(t => t.name === 'tw:bg-brand')?.value).toBe('#123456')
      expect(result.snapshot.categories.find(c => c.id === 'spacing')?.tokens.some(t => t.value === '0.3rem')).toBe(true)
      expect(result.dependencies).toContain(`${fixture.root}/src/colors.css`)
      expect(result.css).not.toContain('box-sizing')
      await fixture.write('src/new.css', '@import "tailwindcss";')
      expect((await discoverTailwindSources(fixture.api, engine, {})).find(s => s.relativePath === main.relativePath)?.id).toBe(main.id)
    }
    finally { await fixture.close() }
  })
})
