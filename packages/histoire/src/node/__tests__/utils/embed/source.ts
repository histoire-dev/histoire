import { getDefaultConfig } from '../../../config/defaults.js'
import { createRuntimeCatalog } from '../../../runtime/catalog/publication.js'
import { createRuntimeContent } from '../../../runtime/content/service.js'
import { createMcpContext, createMcpProjectFixture, MCP_PROJECT_OPTIONS } from '../mcp/project.js'

/** One shared emitted-source fixture; no collector, story import, or browser required. */
export async function createEmbedSourceFixture() {
  const fixture = await createMcpProjectFixture()
  try {
    const story = await fixture.physical('export const privateCode = "source-body"')
    story.story.docsText = 'lazy-doc-body'
    const context = createMcpContext(fixture.root, [story])
    context.config = getDefaultConfig()
    context.config.embed = { enabled: true, allowedOrigins: ['https://host.test:8443'] }
    context.config.theme.title = 'Portable book'
    context.config.outDir = fixture.root
    context.resolvedViteConfig.base = '/nested/book/'
    const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
    await catalog.publish(context)
    return {
      ...fixture,
      context,
      story,
      catalog,
      content: createRuntimeContent({ root: fixture.root, catalog }),
    }
  }
  catch (error) {
    await fixture.close()
    throw error
  }
}
