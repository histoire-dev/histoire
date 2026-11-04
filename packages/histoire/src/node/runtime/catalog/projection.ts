import type { HistoireCatalog, HistoireCatalogStory, HistoireCatalogTreeNode, HistoireDiagnostic } from '@histoire/protocol'
import type { HistoireConfig, ServerStoryFile, ServerTree } from '@histoire/shared'
import type { CatalogDiagnostic, CatalogStory } from './types.js'
import { normalizeHistoireMatrixHint } from '@histoire/protocol'
import { makeTree } from '../../tree.js'
import { boundedWarnings } from './diagnostics.js'
import { createCatalogMetaBudget, projectMeta } from './meta.js'

/**
 * Projects allowlisted metadata into portable immutable browser catalog.
 * @param stories Accepted stories.
 * @param diagnostics Already bounded diagnostics.
 * @param files Registered story files carrying collected extras (layout, icons, `meta`).
 * @param config Project config.
 * @param maxDiagnostics Count cap `diagnostics` were bounded with; projection warnings share it.
 */
export function projectCatalog(stories: readonly CatalogStory[], diagnostics: readonly CatalogDiagnostic[], files: readonly ServerStoryFile[] = [], config?: HistoireConfig, maxDiagnostics?: number): HistoireCatalog {
  const registeredFiles = new Map(files.map(file => [file.relativePath.replace(/\\/g, '/'), file]))
  const warnings: HistoireDiagnostic[] = []
  const metaBudget = createCatalogMetaBudget()
  const projected = stories.map((story): HistoireCatalogStory => {
    const extra = registeredFiles.get(story.filePath)?.story
    const layout = extra?.layout
    const matrix = normalizeHistoireMatrixHint(extra?.matrix ?? story.matrix)
    return Object.freeze({
      id: story.id,
      title: story.title,
      path: Object.freeze(story.treePath.slice()),
      relativePath: story.filePath,
      fileOrigin: story.fileOrigin,
      supportPluginId: story.supportPluginId,
      ...(story.runtimeRevision ? { runtimeRevision: story.runtimeRevision } : {}),
      docsOnly: story.docsOnly,
      ...(typeof extra?.layoutExplicit === 'boolean' ? { layoutExplicit: extra.layoutExplicit } : {}),
      ...(typeof extra?.hasCustomControls === 'boolean' ? { hasCustomControls: extra.hasCustomControls } : {}),
      ...(matrix ? { matrix } : {}),
      ...(story.group == null ? {} : { group: story.group }),
      ...(typeof extra?.icon === 'string' ? { icon: extra.icon } : {}),
      ...(typeof extra?.iconColor === 'string' ? { iconColor: extra.iconColor } : {}),
      ...(layout?.type === 'single' || layout?.type === 'grid' ? { layout: Object.freeze({ type: layout.type }) } : {}),
      ...projectMeta(extra, { storyId: story.id }, metaBudget, warnings),
      variants: Object.freeze(story.variants.map((variant) => {
        const collected = extra?.variants.find(value => value.id === variant.id)
        const hasTests = (collected as { hasTests?: boolean })?.hasTests
        return Object.freeze({ id: variant.id, title: variant.title, ...(typeof collected?.icon === 'string' ? { icon: collected.icon } : {}), ...(typeof hasTests === 'boolean' ? { hasTests } : {}), source: Object.freeze({ raw: story.sourceAvailable, dynamic: !story.docsOnly }), ...projectMeta(collected, { storyId: story.id, variantId: variant.id }, metaBudget, warnings) })
      })),
      content: Object.freeze({ docs: story.docsAvailable, rawSource: story.sourceAvailable }),
    })
  })
  const registered = stories.map(story => ({ ...registeredFiles.get(story.filePath), treePath: story.treePath, story } as ServerStoryFile))
  const groups = [...new Set(stories.map(story => story.group).filter(Boolean))].map(id => ({ id, title: id }))
  const tree = makeTree({ ...config, tree: config?.tree ?? { order: 'asc', groups } } as HistoireConfig, registered)
  /** Preserves configured sorting/group titles while replacing array indices with exact IDs. */
  function projectTree(nodes: ServerTree): readonly HistoireCatalogTreeNode[] {
    return Object.freeze(nodes.map(node => 'index' in node
      ? Object.freeze({ kind: 'story' as const, title: node.title, storyId: stories[node.index].id })
      : Object.freeze({ kind: 'group' in node && node.group ? 'group' as const : 'folder' as const, title: node.title, ...('id' in node && node.id !== undefined ? { id: node.id } : {}), children: projectTree(node.children) })))
  }
  return Object.freeze({ stories: Object.freeze(projected), tree: projectTree(tree), diagnostics: Object.freeze([...diagnostics.map(item => Object.freeze({ code: item.code, message: item.message, severity: 'error' as const, ...(item.storyId ? { storyId: item.storyId } : {}), ...(item.filePath ? { relativePath: item.filePath } : {}) })), ...boundedWarnings(diagnostics, warnings, maxDiagnostics)]) })
}
