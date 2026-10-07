import type { Context } from '../context.js'
import micromatch from 'micromatch'
import { relative, resolve } from 'pathe'
import { isPathWithinRoot } from '../runtime/content/files.js'
import { getProjectTempDir } from './temp-paths.js'

/** Shares source admission and directory pruning across both filesystem watchers. */
export function createStoryIgnore(ctx: Context) {
  const temporary = getProjectTempDir(ctx.root)
  const patterns = ctx.config.storyIgnored.map(pattern => resolve(ctx.root, pattern))
  return (file: string) => {
    const absolute = resolve(ctx.root, file)
    // Old and concurrent runs can contain gigabytes of optimizer output.
    // Prune the directory itself; generated stories register through addStory.
    return isPathWithinRoot(temporary, absolute) || patterns.some(pattern => micromatch.isMatch(absolute, pattern))
  }
}

/** Prunes only kind/run/vite cache ancestry, retaining generated plugin sources. */
export function createOptimizerCacheIgnore(ctx: Context) {
  const temporary = getProjectTempDir(ctx.root)
  return (file: string) => {
    const absolute = resolve(ctx.root, file)
    // Exact segments also handle roots containing glob characters, and never
    // confuse plugins/vite with the optimizer directory beside plugins.
    return isPathWithinRoot(temporary, absolute) && relative(temporary, absolute).split('/')[2] === 'vite'
  }
}
