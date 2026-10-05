import type { HistoireBuildInfo, ServerStory } from '@histoire/shared'
import type { Context } from './context.js'
import type { BuiltCaptureMetadata } from './runtime/catalog/build-metadata.js'
import { fileHasVitestMocks } from './util/story-vitest.js'

interface SerializedStory extends Omit<ServerStory, 'docsText'> {
  /** Only kept for stories whose docs are unreachable in the built app. */
  docsText?: string
  relativePath: string
  supportPluginId: string
  treePath?: string[]
  virtual?: boolean
  markdownFile?: SerializedMarkdownFile
}

interface SerializedMarkdownFile {
  id: string
  relativePath: string
  isRelatedToStory: boolean
  frontmatter?: any
}

export interface SerializedStoryData {
  stories: SerializedStory[]
  markdownFiles: SerializedMarkdownFile[]
  /** Optional additive capture settings for immutable built preview. */
  capture?: BuiltCaptureMetadata
  /** Optional workbench project metadata. */
  buildInfo?: HistoireBuildInfo
}

/** Serializes existing story fields compatibly; capture metadata is added after assets complete. */
export function getSerializedStoryData(ctx: Context): SerializedStoryData {
  const data: SerializedStoryData = {
    stories: [],
    markdownFiles: [],
  }

  for (const storyFile of ctx.storyFiles) {
    if (storyFile.story) {
      // docsText otherwise only feeds the build-time search index — keeping it
      // out of histoire.json spares built apps every story's docs text.
      //
      // Vitest-mocked stories are the exception: their module only executes
      // inside the preview iframe, so the app can never load the component
      // carrying the rendered `<docs>` block and this extracted text is the
      // only documentation it can show for them.
      const { docsText, ...story } = storyFile.story
      const keepDocsText = docsText && fileHasVitestMocks(storyFile)
      data.stories.push({
        ...story,
        ...(keepDocsText ? { docsText } : {}),
        relativePath: storyFile.relativePath,
        supportPluginId: storyFile.supportPluginId,
        treePath: storyFile.treePath,
        virtual: storyFile.virtual,
        markdownFile: storyFile.markdownFile
          ? {
              id: storyFile.markdownFile.id,
              relativePath: storyFile.markdownFile.relativePath,
              isRelatedToStory: storyFile.markdownFile.isRelatedToStory,
              frontmatter: storyFile.markdownFile.frontmatter,
            }
          : null,
      })
    }
  }

  for (const markdownFile of ctx.markdownFiles) {
    data.markdownFiles.push({
      id: markdownFile.id,
      relativePath: markdownFile.relativePath,
      isRelatedToStory: markdownFile.isRelatedToStory,
      frontmatter: markdownFile.frontmatter,
    })
  }

  return data
}
