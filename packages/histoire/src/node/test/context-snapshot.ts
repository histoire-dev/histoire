import type { Context } from '../context.js'

/** Clone mutable plain metadata, retaining opaque handles/functions outside that data graph. */
function cloneMetadata<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== 'object') return value
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value
  if (seen.has(value)) return seen.get(value) as T
  const copy = Array.isArray(value) ? [] : Object.create(prototype)
  seen.set(value, copy)
  for (const [key, item] of Object.entries(value)) copy[key] = cloneMetadata(item, seen)
  return copy as T
}

/** Detach selected story/Markdown graph while preserving config and plugin function references. */
export function createTestContextSnapshot(ctx: Context, storyId?: string): Context {
  const storyFiles = ctx.storyFiles
    .filter(file => storyId === undefined || file.story?.id === storyId)
    .map(file => ({ ...file, treePath: file.treePath ? [...file.treePath] : undefined, story: cloneMetadata(file.story), treeFile: cloneMetadata(file.treeFile) }))
  const markdownFiles = ctx.markdownFiles.filter(file => !file.storyFile || storyFiles.some(story => story.path === file.storyFile!.path))
    .map(file => ({ ...file, frontmatter: cloneMetadata(file.frontmatter) }))
  for (const file of storyFiles) {
    file.markdownFile = markdownFiles.find(markdown => markdown.absolutePath === file.markdownFile?.absolutePath)
  }
  for (const file of markdownFiles) {
    file.storyFile = storyFiles.find(story => story.path === file.storyFile?.path)
  }
  return { ...ctx, storyFiles, markdownFiles, registeredCommands: [...(ctx.registeredCommands ?? [])] }
}
