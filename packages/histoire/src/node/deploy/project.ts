import type { HistoireMcpProject } from '../mcp/project/facade.js'
import type { McpProject } from '../mcp/protocol/project-schema.js'
import type { NodeArtifact } from './artifact-reader.js'
import { createPreviewUrls } from '../mcp/project/preview-urls.js'
import { createStoryResult } from '../mcp/project/story-result.js'
import { createMcpEpoch, createMcpProjectId } from '../mcp/protocol/ids.js'
import { createNodeCatalog } from './catalog.js'
import { createNodeContent } from './content.js'

/** Build-backed read facade with process-scoped identity and runtime capabilities. */
export function createNodeMcpProject(options: { artifact: NodeArtifact, origin: () => string, isActive: () => boolean, capabilities: () => McpProject['capabilities'] }) {
  const manifest = options.artifact.manifest
  const projectId = createMcpProjectId(manifest.buildId)
  const epoch = createMcpEpoch()
  const revision = `${epoch}:1`
  const catalog = createNodeCatalog(manifest, projectId, revision)
  const content = createNodeContent(options.artifact, catalog)
  const project: HistoireMcpProject = {
    projectId,
    getProject: () => ({ projectId, epoch, revision, runtimeMode: 'node', buildId: manifest.buildId, status: options.isActive() ? 'ready' : 'closed', updating: false, title: manifest.title, base: manifest.base, routerMode: manifest.routerMode, storyCount: manifest.stories.length, variantCount: manifest.stories.reduce((sum, item) => sum + item.story.variants.length, 0), capabilities: options.capabilities(), diagnostics: manifest.diagnostics, diagnosticsTruncated: manifest.diagnosticsTruncated }),
    listStories: catalog.list,
    getStory(input) {
      const { projectId, revision, story } = catalog.getStory(input.storyId, input.expectedRevision)
      return createStoryResult({ projectId, revision, story })
    },
    getDocs: content.getDocs,
    getSource: content.getSource,
    getPreview(input) {
      const { story, variant } = catalog.getTarget(input.storyId, input.variantId, input.expectedRevision)
      return { projectId, revision, storyId: story.id, variantId: variant.id, ...createPreviewUrls({ origin: options.origin(), base: manifest.base, routerMode: manifest.routerMode, storyId: story.id, variantId: variant.id }) }
    },
  }
  return { project, catalog, epoch, revision }
}
