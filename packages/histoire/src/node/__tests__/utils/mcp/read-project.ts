import type { HistoireMcpProject } from '../../../mcp/project/facade.js'
import { createProjectCatalog } from '../../../mcp/project/catalog.js'
import { createProjectContent } from '../../../mcp/project/content.js'
import { createPreviewUrls } from '../../../mcp/project/preview-urls.js'
import { createStoryResult } from '../../../mcp/project/story-result.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from './project.js'

/** Real detached catalog/content fixture shared by SDK tool and resource suites. */
export async function createReadProjectFixture(ids = ['story']) {
  const fixture = await createMcpProjectFixture()
  const { root } = fixture
  const projectId = 'fixture-project'
  const { epoch } = MCP_PROJECT_OPTIONS
  const context = createMcpContext(root, ids.map((id, index) => {
    const file = createMcpStory(root, id, `${index}.story.js`, [{ id: 'shared/? #%', title: 'Variant' }])
    file.moduleCode = 'export default "raw source"\r\n'
    file.supportPluginId = 'vanilla'
    file.treePath = ['Group', id]
    file.story.title = `Title ${id}`
    file.story.docsText = 'Documentation 🚀 original'
    file.story.meta = { secret: 'not public' }
    return file
  }))
  const catalog = createProjectCatalog({ root, projectId, epoch })
  await catalog.publish(context)
  const content = createProjectContent({ root, catalog })
  const project: HistoireMcpProject = {
    projectId,
    getProject: () => ({ projectId, epoch, revision: catalog.current.revision, runtimeMode: 'dev', status: 'ready', updating: catalog.updating, title: 'Fixture', base: '/book/', routerMode: 'history', storyCount: ids.length, variantCount: ids.length, diagnostics: [...catalog.current.diagnostics], capabilities: { catalog: true, content: true, previews: true, screenshots: { available: false }, tests: { available: false, engine: 'unavailable' } } }),
    listStories: input => catalog.list(input),
    getStory: input => createStoryResult(catalog.getStory(input.storyId, input.expectedRevision)),
    getDocs: input => content.getDocs(input),
    getSource: input => content.getSource(input),
    getPreview(input) {
      const target = catalog.getTarget(input.storyId, input.variantId, input.expectedRevision)
      return { projectId, revision: target.revision, storyId: input.storyId, variantId: input.variantId, ...createPreviewUrls({ origin: 'http://localhost:7482', base: '/book/', routerMode: 'history', storyId: input.storyId, variantId: input.variantId }) }
    },
  }
  return { project, catalog, context, close: fixture.close }
}
