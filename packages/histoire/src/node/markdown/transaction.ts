import type { Context } from '../context.js'

/** Runs a synchronous commit, restoring owned records if rendering rejects it. */
export function commitMarkdown<T>(ctx: Context, commit: () => T): T {
  const markdown = ctx.markdownFiles.slice()
  const stories = ctx.storyFiles.slice()
  const snapshots = [
    ...markdown.map(file => ({ file, keys: ['frontmatter', 'content', 'html', 'isRelatedToStory', 'storyFile'] })),
    ...stories.map(file => ({ file, keys: ['moduleCode', 'markdownFile'] })),
  ].map(({ file, keys }) => ({ file, values: keys.map(key => ({ key, present: Object.hasOwn(file, key), value: file[key] })) }))
  // Snapshot only after async preparation. No await inside this transaction:
  // rollback cannot overwrite another watcher event admitted while loading.
  try {
    return commit()
  }
  catch (error) {
    for (const { file, values } of snapshots) {
      for (const { key, present, value } of values) {
        if (present) file[key] = value
        else delete file[key]
      }
    }
    ctx.markdownFiles.splice(0, ctx.markdownFiles.length, ...markdown)
    ctx.storyFiles.splice(0, ctx.storyFiles.length, ...stories)
    throw error
  }
}
