import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { discoverTailwindSources, resolveTailwindEngine } from '../../builtin-plugins/tailwind/discovery.js'
import { generateTailwindSnapshot } from '../../builtin-plugins/tailwind/generate.js'
import { useModuleLoader } from '../../load.js'
import { MCP_REPOSITORY_ROOT } from '../utils/mcp/cli-project.js'
import { createTailwindFixture } from '../utils/tailwind.js'

describe('tailwind Vite source resolution', () => {
  it('uses generated Nuxt UI aliases instead of its package fallback theme', async () => {
    const fixture = await createTailwindFixture(4)
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    try {
      await fixture.write('node_modules/@nuxt/marker', '')
      await symlink(join(MCP_REPOSITORY_ROOT, 'examples/nuxt-ui/node_modules/@nuxt/ui'), join(fixture.root, 'node_modules/@nuxt/ui'), 'dir')
      const generated = await fixture.write('generated/ui.css', '@theme { --color-primary-500: #123456; --font-sans: Fixture Sans; }')
      await fixture.write('compat.ts', `export default {theme:{extend:{colors:{compat:'#fedcba'}}}}`)
      const imported = await fixture.write('plugin-color.ts', `export default '#456789'`)
      await fixture.write('plugin.ts', `import color from './plugin-color';export default ({addUtilities})=>addUtilities({'.bg-plugin':{backgroundColor:color}})`)
      await fixture.write('main.css', '@import "tailwindcss"; @import "@nuxt/ui"; @config "./compat.ts"; @plugin "./plugin.ts";')
      server = await createServer({
        root: fixture.root,
        configFile: false,
        resolve: { alias: { '#build/ui.css': generated } },
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      fixture.api.moduleLoader = useModuleLoader({ server, throws: true })
      const engine = await resolveTailwindEngine(fixture.root)
      const sources = await discoverTailwindSources(fixture.api, engine!, {})
      const result = await generateTailwindSnapshot(fixture.api, engine!, sources.find(source => source.relativePath === 'main.css')!, {})
      const primary = result.snapshot.categories.find(category => category.id === 'background-color')!.tokens.find(token => token.name === 'bg-primary-500')!
      expect(primary.value).toBe('#123456')
      expect(result.dependencies).toContain(generated)
      expect(result.dependencies.some(file => file.endsWith('ui.static.css'))).toBe(false)
      expect(result.dependencies).toContain(imported)
      expect(result.snapshot.categories.find(category => category.id === 'background-color')!.tokens.find(token => token.name === 'bg-compat')?.value).toBe('#fedcba')
      expect(result.snapshot.categories.find(category => category.id === 'background-color')!.tokens.find(token => token.name === 'bg-plugin')?.value).toBe('#456789')
    }
    finally {
      await server?.close()
      await fixture.close()
    }
  })

  it('rebases resources in imported CSS and retains contextual theme variables', async () => {
    const fixture = await createTailwindFixture(4)
    try {
      const font = await fixture.write('styles/font.woff2', 'fixture-font')
      await fixture.write('styles/theme.css', '@font-face { font-family: Fixture; src: url("./font.woff2"); } @theme { --font-fixture: Fixture; --color-brand: var(--brand); } :root { --brand: #123456; } .dark { --brand: #abcdef; } button { background: red; }')
      await fixture.write('main.css', '@import "tailwindcss"; @import "./styles/theme.css";')
      const engine = await resolveTailwindEngine(fixture.root)
      const sources = await discoverTailwindSources(fixture.api, engine!, {})
      const result = await generateTailwindSnapshot(fixture.api, engine!, sources[0], {})
      expect(result.dependencies).toContain(font)
      expect(result.css).toContain(font)
      expect(result.css).toContain('--brand: #abcdef')
      expect(result.css).not.toContain('background: red')
      expect(result.css).not.toContain('box-sizing')
    }
    finally { await fixture.close() }
  })
})
