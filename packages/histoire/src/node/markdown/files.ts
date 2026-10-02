import type { ServerMarkdownFile } from '@histoire/shared'
import type MarkdownIt from 'markdown-it'
import type { Context } from '../context.js'
import { kebabCase } from 'change-case'
import fs from 'fs-extra'
import matter from 'gray-matter'
import path from 'pathe'
import { addStory, notifyStoryChange, removeStory } from '../stories.js'
import { notifyMarkdownListChange } from './events.js'

/** Generates the existing docs-only virtual story using freshly parsed frontmatter. */
function virtualModule(file: ServerMarkdownFile): string {
  const frontmatter = file.frontmatter ?? {}
  return `export default ${JSON.stringify({ id: frontmatter.id, title: frontmatter.title, icon: frontmatter.icon ?? 'carbon:document-blank', iconColor: frontmatter.iconColor, group: frontmatter.group, docsOnly: true, variants: [] })}`
}

/** Owns existing Markdown records in place, with no duplicate watcher-created entries. */
export function createMarkdownFileManager(ctx: Context, md: MarkdownIt) {
  let ready = false
  /** Resolves sibling association only against registered physical story files. */
  function relatedStory(file: ServerMarkdownFile) {
    const truncatedName = path.basename(file.absolutePath, '.md')
    const searchPath = path.join(path.dirname(file.relativePath), truncatedName)
    return ctx.storyFiles.find(story => !story.virtual && story.relativePath.startsWith(searchPath))
  }
  /** Preserves record identity while switching between sibling and standalone modes. */
  function associate(file: ServerMarkdownFile) {
    const previous = file.storyFile
    const physical = relatedStory(file)
    // During initial scans the physical story watcher may not have registered
    // a matching file yet. Directory discovery preserves existing precedence.
    const truncatedName = path.basename(file.absolutePath, '.md')
    const siblingExists = !!physical || fs.readdirSync(path.dirname(file.absolutePath)).some(name => !name.endsWith('.md') && name.startsWith(truncatedName))
    file.isRelatedToStory = siblingExists
    if (previous && previous !== physical && previous.virtual && siblingExists) removeStory(previous.relativePath)
    if (previous && previous !== physical && previous.markdownFile === file) delete previous.markdownFile
    if (siblingExists) {
      file.storyFile = physical
      if (physical) physical.markdownFile = file
    }
    else {
      const relativePath = file.relativePath.replace(/\.md$/, '.js')
      const code = virtualModule(file)
      const story = addStory(relativePath, code)
      // addStory intentionally returns an existing registered record. Changes
      // must update that record's generated module, otherwise recollection
      // would keep the previous frontmatter title/id forever.
      story.moduleCode = code
      story.markdownFile = file
      file.storyFile = story
    }
    return previous !== file.storyFile
  }
  /** Adds or updates one parsed Markdown record; renders before announcing it. */
  function update(relativePath: string) {
    const absolutePath = path.resolve(ctx.root, relativePath)
    const { data: frontmatter, content } = matter(fs.readFileSync(absolutePath, 'utf8'))
    let file = ctx.markdownFiles.find(item => item.relativePath === relativePath)
    if (!file) {
      file = { id: kebabCase(relativePath.toLowerCase()), relativePath, absolutePath, isRelatedToStory: false }
      ctx.markdownFiles.push(file)
    }
    file.frontmatter = frontmatter
    file.content = content
    associate(file)
    if (ready) file.html = md.render(content, { file: absolutePath })
    notifyStoryChange(file.storyFile)
    notifyMarkdownListChange()
    return file
  }
  /** Removes Markdown and clears sibling docs before recollecting affected stories. */
  function remove(relativePath: string) {
    const index = ctx.markdownFiles.findIndex(item => item.relativePath === relativePath)
    if (index === -1) return
    const [file] = ctx.markdownFiles.splice(index, 1)
    const story = file.storyFile
    if (story?.markdownFile === file) delete story.markdownFile
    if (story?.virtual && !file.isRelatedToStory) removeStory(story.relativePath)
    notifyStoryChange(story?.virtual ? undefined : story)
    notifyMarkdownListChange()
  }
  /** Reassociates already parsed docs after registered physical stories add/unlink. */
  function reconcile() {
    let changed = false
    for (const file of ctx.markdownFiles) {
      if (associate(file)) {
        changed = true
        if (ready) file.html = md.render(file.content ?? '', { file: file.absolutePath })
        notifyStoryChange(file.storyFile)
      }
    }
    if (changed) notifyMarkdownListChange()
  }
  return {
    update,
    remove,
    reconcile,
    /** Renders only after all link targets have been discovered. */
    finishInitialScan() {
      reconcile()
      for (const file of ctx.markdownFiles) file.html = md.render(file.content ?? '', { file: file.absolutePath })
      ready = true
    },
  }
}
