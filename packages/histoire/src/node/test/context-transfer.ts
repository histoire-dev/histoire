import type { ServerMarkdownFile, ServerStoryFile } from '@histoire/shared'
import type { Context } from '../context.js'

/** Acyclic project file metadata accepted by the owned test worker. */
export interface TestContextFiles {
  /** Collected stories without cyclic documentation links. */
  storyFiles: Omit<ServerStoryFile, 'markdownFile'>[]
  /** Documentation with explicit association identity instead of object links. */
  markdownFiles: (Omit<ServerMarkdownFile, 'storyFile'> & {
    /** Absolute registered story path restores the docs association in the child. */
    storyPath?: string
  })[]
}

/** Captures Markdown lookup data alongside stories without crossing live context handles. */
export function captureTestContextFiles(ctx: Context): TestContextFiles {
  return {
    storyFiles: ctx.storyFiles.map(({ markdownFile: _markdown, ...file }) => file),
    markdownFiles: ctx.markdownFiles.map(({ storyFile, ...file }) => ({ ...file, storyPath: storyFile?.path })),
  }
}

/** Reconstructs the child-owned graph before inline Markdown transforms execute. */
export function restoreTestContextFiles(ctx: Context, files: TestContextFiles): void {
  ctx.storyFiles = files.storyFiles
  ctx.markdownFiles = files.markdownFiles.map(({ storyPath, ...file }) => ({
    ...file,
    storyFile: ctx.storyFiles.find(story => story.path === storyPath),
  }))
  for (const file of ctx.markdownFiles) {
    if (file.storyFile) file.storyFile.markdownFile = file
  }
}
