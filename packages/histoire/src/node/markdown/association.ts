import type { ServerMarkdownFile } from '@histoire/shared'
import type { Context } from '../context.js'
import fs from 'fs-extra'
import path from 'pathe'
import { addStory, removeStory } from '../stories.js'

/** Resolves sibling precedence before either watcher has completed discovery. */
function sibling(ctx: Context, file: ServerMarkdownFile) {
  const stem = path.basename(file.absolutePath, '.md')
  const searchPath = path.join(path.dirname(file.relativePath), stem)
  const physical = ctx.storyFiles.find(story => !story.virtual && story.relativePath.startsWith(searchPath))
  const directory = path.dirname(file.absolutePath)
  const exists = !!physical || (fs.existsSync(directory) && fs.readdirSync(directory).some(name => !name.endsWith('.md') && name.startsWith(stem)))
  return { physical, exists }
}

/** Avoids re-rendering documents in response to their own publication events. */
export function needsMarkdownAssociation(ctx: Context, file: ServerMarkdownFile) {
  const { physical, exists } = sibling(ctx, file)
  return exists !== file.isRelatedToStory || (exists ? file.storyFile !== physical : !file.storyFile)
}

/** Generates the existing docs-only module from current frontmatter. */
function virtualModule(file: ServerMarkdownFile): string {
  const frontmatter = file.frontmatter ?? {}
  return `export default ${JSON.stringify({ id: frontmatter.id, title: frontmatter.title, icon: frontmatter.icon ?? 'carbon:document-blank', iconColor: frontmatter.iconColor, group: frontmatter.group, docsOnly: true, variants: [] })}`
}

/** Preserves records while switching between physical and docs-only stories. */
export function associateMarkdown(ctx: Context, file: ServerMarkdownFile) {
  const previous = file.storyFile
  const { physical, exists } = sibling(ctx, file)
  file.isRelatedToStory = exists
  if (previous && previous !== physical && previous.virtual && exists) removeStory(ctx, previous.relativePath)
  if (previous && previous !== physical && previous.markdownFile === file) delete previous.markdownFile
  if (exists) {
    file.storyFile = physical
    if (physical) physical.markdownFile = file
  }
  else {
    const code = virtualModule(file)
    const story = addStory(ctx, file.relativePath.replace(/\.md$/, '.js'), code)
    // addStory can return an existing record. Refresh its module in place so
    // recollection sees edited frontmatter without losing story identity.
    story.moduleCode = code
    story.markdownFile = file
    file.storyFile = story
  }
  return previous !== file.storyFile
}
