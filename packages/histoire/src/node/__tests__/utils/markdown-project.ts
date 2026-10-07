import { closeContext } from '../../context.js'
import { createMcpContext, createMcpProjectFixture } from './mcp/project.js'

/** Owns a real temporary Markdown project using the shared project fixture. */
export async function createMarkdownProject() {
  const fixture = await createMcpProjectFixture()
  const ctx = createMcpContext(fixture.root)
  ctx.resolvedViteConfig = { root: fixture.root, base: '/', publicDir: '' }
  ctx.config = {
    plugins: [],
    storyMatch: ['**/*.story.vue'],
    storyIgnored: ['**/node_modules/**', '**/.histoire/**'],
    supportMatch: [{ patterns: ['**/*.js', '**/*.vue'], pluginIds: ['vanilla'] }],
  } as any
  return {
    /** Project context shared by its real Markdown consumers. */
    ctx,
    /** Writes real source through the existing project fixture. */
    write: fixture.physical,
    /** Releases context resources before removing only this fixture. */
    async close() {
      try {
        await closeContext(ctx)
      }
      finally { await fixture.close() }
    },
  }
}
