import type { PluginApiBuild } from '@histoire/shared'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createJiti } from 'jiti'
import { vi } from 'vitest'
import { BuildPluginApi } from '../../plugin.js'
import { closeContext } from '../../runtime/registry.js'
import { linkMcpFixtureDependencies, MCP_REPOSITORY_ROOT } from './mcp/cli-project.js'
import { createMcpContext, createMcpProjectFixture } from './mcp/project.js'

/** Real project engine plus context-owned output, shared by Tailwind tests. */
export async function createTailwindFixture(version: 3 | 4, browserDependencies = false) {
  const fixture = await createMcpProjectFixture()
  const ctx = createMcpContext(fixture.root)
  ctx.config = { plugins: [], tree: {}, supportMatch: [{ id: 'vanilla', patterns: ['**/*.js'], pluginIds: ['vanilla'] }] } as any
  const require = createRequire(join(MCP_REPOSITORY_ROOT, version === 3 ? 'package.json' : 'examples/nuxt-ui/package.json'))
  if (browserDependencies) await linkMcpFixtureDependencies(fixture.root, 'vue3')
  else await mkdir(join(fixture.root, 'node_modules'))
  const installation = version === 4 ? process.env.HISTOIRE_TAILWIND_V4_COMPAT_ROOT : undefined
  await symlink(installation ?? dirname(require.resolve('tailwindcss/package.json')), join(fixture.root, 'node_modules/tailwindcss'), 'dir')
  await writeFile(join(fixture.root, 'package.json'), '{"type":"module"}')
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false, tryNative: false })
  const loader = {
    /** Mirror runtime invalidation for fixture-owned CommonJS modules. */
    clearCache: vi.fn(() => {
      for (const file of Object.keys(require.cache)) {
        if (file.startsWith(fixture.root)) delete require.cache[file]
      }
    }),
    loadModule: (file: string) => jiti.import(file),
    destroy() {},
  }
  const api: PluginApiBuild = new BuildPluginApi(ctx, { name: 'builtin:tailwind-tokens' }, loader)
  api.error = vi.fn()
  return {
    ...fixture,
    ctx,
    api,
    /** Write project-owned source beneath root. */
    async write(file: string, source: string) {
      const path = join(fixture.root, file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, source)
      return path
    },
    /** Drain captured runtime before deleting fixture. */
    async close() {
      await closeContext(ctx)
      await fixture.close()
    },
  }
}
