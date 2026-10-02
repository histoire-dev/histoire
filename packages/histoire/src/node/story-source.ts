import type { ServerStoryFile } from '@histoire/shared'
import { readFile } from 'node:fs/promises'

/** Physical source selection shared by the Source panel and constrained MCP reader. */
export type StorySourceFile = Pick<ServerStoryFile, 'path' | 'virtual' | 'moduleCode'>

/** Reads original physical source or generated virtual module without framework parsing. */
export async function readStorySource(file: StorySourceFile, readPhysical?: (path: string) => Promise<string>): Promise<string | undefined> {
  if (file.virtual) return file.moduleCode
  return readPhysical ? readPhysical(file.path) : readFile(file.path, 'utf8')
}
