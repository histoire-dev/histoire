import type MarkdownIt from 'markdown-it'
import type { Context } from '../context.js'
import { kebabCase } from 'change-case'
import fs from 'fs-extra'
import matter from 'gray-matter'
import path from 'pathe'
import { getContextRegistry } from '../runtime/registry.js'
import { notifyStoryChange, removeStory } from '../stories.js'
import { associateMarkdown, needsMarkdownAssociation } from './association.js'
import { notifyMarkdownListChange } from './events.js'
import { prepareMarkdown } from './render.js'
import { commitMarkdown } from './transaction.js'

/** Owns Markdown records; completes grammar preparation before atomic publication. */
export function createMarkdownFileManager(ctx: Context, md: MarkdownIt, ownsWork: () => boolean = () => true) {
  let ready = false
  /** Fences stale watcher generations and context teardown. */
  function active() {
    return ownsWork() && !getContextRegistry(ctx).cleanup.isClosing
  }

  /** Stages an edit, then publishes content, association and HTML together. */
  async function update(relativePath: string, current: () => boolean = active) {
    if (!active() || !current()) return
    const absolutePath = path.resolve(ctx.root, relativePath)
    const { data: frontmatter, content } = matter(fs.readFileSync(absolutePath, 'utf8'))
    const prepared = ready ? await prepareMarkdown(ctx, md, content, { file: absolutePath }) : undefined
    if (!active() || !current()) return
    const file = commitMarkdown(ctx, () => {
      let file = ctx.markdownFiles.find(item => item.relativePath === relativePath)
      if (!file) {
        file = { id: kebabCase(relativePath.toLowerCase()), relativePath, absolutePath, isRelatedToStory: false }
        ctx.markdownFiles.push(file)
      }
      file.frontmatter = frontmatter
      file.content = content
      associateMarkdown(ctx, file)
      if (prepared) file.html = prepared.render()
      return file
    })
    if (ready) {
      notifyStoryChange(ctx, file.storyFile)
      notifyMarkdownListChange(ctx)
    }
    return file
  }

  /** Removes docs and clears sibling metadata before notifying collection. */
  function remove(relativePath: string) {
    if (!active()) return
    const index = ctx.markdownFiles.findIndex(item => item.relativePath === relativePath)
    if (index === -1) return
    const [file] = ctx.markdownFiles.splice(index, 1)
    const story = file.storyFile
    if (story?.markdownFile === file) delete story.markdownFile
    if (story?.virtual && !file.isRelatedToStory) removeStory(ctx, story.relativePath)
    if (ready) {
      notifyStoryChange(ctx, story?.virtual ? undefined : story)
      notifyMarkdownListChange(ctx)
    }
  }

  /** Reassociates docs after physical story add/unlink without partial publication. */
  async function reconcile() {
    if (!active() || !ctx.markdownFiles.some(file => needsMarkdownAssociation(ctx, file))) return
    const files = ctx.markdownFiles.slice()
    const prepared = ready ? await Promise.all(files.map(file => prepareMarkdown(ctx, md, file.content ?? '', { file: file.absolutePath }))) : []
    if (!active()) return
    const changed = commitMarkdown(ctx, () => {
      const changed = files.filter(file => ctx.markdownFiles.includes(file) && associateMarkdown(ctx, file))
      for (const file of changed) {
        if (ready) file.html = prepared[files.indexOf(file)].render()
      }
      return changed
    })
    if (ready && changed.length) {
      for (const file of changed) notifyStoryChange(ctx, file.storyFile)
      notifyMarkdownListChange(ctx)
    }
  }

  return {
    update,
    remove,
    reconcile,
    /** Renders only after discovery and association of every forward link target. */
    async finishInitialScan() {
      if (!active()) return
      const files = ctx.markdownFiles.slice()
      const prepared = await Promise.all(files.map(file => prepareMarkdown(ctx, md, file.content ?? '', { file: file.absolutePath })))
      if (!active()) return
      commitMarkdown(ctx, () => {
        for (const file of files) associateMarkdown(ctx, file)
        const html = prepared.map(document => document.render())
        files.forEach((file, index) => {
          file.html = html[index]
        })
      })
      ready = true
      for (const file of files) notifyStoryChange(ctx, file.storyFile)
      if (files.length) notifyMarkdownListChange(ctx)
    },
  }
}
