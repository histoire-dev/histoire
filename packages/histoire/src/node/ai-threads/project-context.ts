import type { Context } from '../context.js'
import { isHistoireProjectFileOrigin } from '@histoire/protocol'
import path from 'pathe'

/** Maximum example story paths given to an agent. */
const EXAMPLES = 3

/** Story conventions an agent needs to write valid stories for this project. */
export interface AiProjectContext {
  /** Globs collecting story files. */
  storyMatch: string[]
  /** Configured Histoire plugin names (framework support). */
  plugins: string[]
  /** Project-relative setup files. */
  setupFiles: string[]
  /** Number of project-owned story files. */
  stories: number
  /** Project-relative story files to follow as examples. */
  examples: string[]
}

/**
 * Project-relative path of a configured setup file, if it stays inside the project.
 * A leading `/` outside the root is Vite root-relative (`/src/setup.ts`).
 * @param root Project root.
 * @param file Configured path.
 */
function projectPath(root: string, file: string): string | undefined {
  const absolute = path.isAbsolute(file) && !file.startsWith(`${root}/`) ? path.join(root, file) : path.resolve(root, file)
  const relative = path.relative(root, absolute)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : undefined
}

/**
 * Extension of a story file including its `.story` marker (`.story.vue`).
 * @param file Story file path.
 */
function storyExtension(file: string): string {
  const base = path.basename(file)
  const index = base.indexOf('.')
  return index === -1 ? '' : base.slice(index)
}

/**
 * Bounded story conventions; examples use the most common story extension so
 * the agent copies the dominant framework syntax.
 * @param ctx Dev context.
 */
export function aiProjectContext(ctx: Context): AiProjectContext {
  const setup = ctx.config.setupFile
  const setupFiles = (typeof setup === 'string' ? [setup] : Object.values(setup ?? {}))
    .filter((file): file is string => typeof file === 'string' && Boolean(file))
    .map(file => projectPath(ctx.root, file))
    .filter((file): file is string => Boolean(file))
  const files = ctx.storyFiles.filter(file => isHistoireProjectFileOrigin(file.fileOrigin)).map(file => file.relativePath)
  // Count extensions and keep the first one reaching the highest count.
  const counts = new Map<string, number>()
  for (const file of files) counts.set(storyExtension(file), (counts.get(storyExtension(file)) ?? 0) + 1)
  const dominant = [...counts].reduce<[string, number] | undefined>((best, entry) => !best || entry[1] > best[1] ? entry : best, undefined)?.[0]
  return {
    storyMatch: [...ctx.config.storyMatch ?? []],
    plugins: (ctx.config.plugins ?? []).map(plugin => plugin.name),
    setupFiles,
    stories: files.length,
    examples: files.filter(file => storyExtension(file) === dominant).slice(0, EXAMPLES),
  }
}
