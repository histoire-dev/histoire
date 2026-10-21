import type { ViteDevServer } from 'vite'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { APP_PATH } from '../alias.js'
import { createBuildViteConfig } from '../build/vite-config.js'
import { closeContext, createContext } from '../context.js'
import { createMcpProjectFixture } from './utils/mcp/project.js'

describe('book bundler ownership', () => {
  it.each(['rollupOptions', 'rolldownOptions', 'both'])('keeps book entries when project supplies %s', async (key) => {
    const fixture = await createMcpProjectFixture()
    let ctx: Awaited<ReturnType<typeof createContext>> | undefined
    try {
      const options = { input: 'project-library.ts', external: ['vue'], treeshake: false }
      const build = key === 'both'
        ? { rollupOptions: options, rolldownOptions: { ...options, input: 'project-native.ts' } }
        : { [key]: options }
      await writeFile(join(fixture.root, 'vite.config.mjs'), `export default ${JSON.stringify({ build })}`)
      ctx = await createContext({ root: fixture.root, mode: 'build' })
      ctx.config.embed = { enabled: true }
      const config = await createBuildViteConfig(ctx, { config: { server: {} } } as ViteDevServer)
      const resolved = await resolveConfig({ ...config, logLevel: 'silent' }, 'build')
      const bundler = resolved.build.rolldownOptions

      expect(bundler.input).toEqual([
        join(APP_PATH, 'bundle-main.js'),
        join(APP_PATH, 'bundle-sandbox.js'),
        join(APP_PATH, 'bundle-embed.js'),
      ])
      expect(bundler.external).toEqual([])
      // Non-owned project policy must survive the book entry overrides.
      expect(bundler.treeshake).toBe(false)
      expect(resolved.build.ssr).toBe(false)
    }
    finally {
      try {
        if (ctx) await closeContext(ctx)
      }
      finally { await fixture.close() }
    }
  })
})
