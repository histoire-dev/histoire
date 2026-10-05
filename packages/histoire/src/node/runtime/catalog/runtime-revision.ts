import type { ServerStoryFile } from '@histoire/shared'
import { hashContent } from '../content/hash.js'

/** Canonical source is required; metadata alone cannot establish executable equality. */
export function getStoryRuntimeRevision(sourceSha256: string | undefined, file: Pick<ServerStoryFile, 'story' | 'relativePath' | 'moduleId' | 'supportPluginId' | 'virtual'>): string | undefined {
  if (!sourceSha256) return undefined
  const story = file.story
  return hashContent(JSON.stringify({
    sourceSha256,
    moduleId: file.moduleId,
    filePath: file.relativePath,
    supportPluginId: file.supportPluginId,
    virtual: file.virtual === true,
    id: story.id,
    title: story.title,
    group: story.group,
    docsOnly: story.docsOnly === true,
    layout: story.layout,
    matrix: story.matrix,
    icon: story.icon,
    iconColor: story.iconColor,
    variants: story.variants,
  }))
}
