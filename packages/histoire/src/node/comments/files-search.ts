import type { UiProjectFile } from '@histoire/shared'
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { basename, dirname, join } from 'pathe'

/** Upper bound of indexed files, so huge repositories cannot exhaust memory. */
const FILE_LIMIT = 50_000
/** Folders never listed by the filesystem fallback. */
const SKIPPED = new Set(['node_modules', 'dist', 'coverage'])
/** Promise-based `execFile`, used to list files through git. */
const run = promisify(execFile)

/**
 * Lists tracked and untracked non-ignored files through git.
 * @param root Project root.
 */
async function gitFiles(root: string): Promise<string[]> {
  const { stdout } = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 10_000 })
  return stdout.split('\0').filter(Boolean)
}

/**
 * Walks the project without git, skipping dependencies and hidden folders.
 * @param root Project root.
 */
async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const pending = ['']
  while (pending.length && files.length < FILE_LIMIT) {
    const directory = pending.shift()!
    const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue
      const path = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  return files.sort()
}

/**
 * Project-relative POSIX paths of mentionable files.
 * @param root Project root.
 */
export async function listProjectFiles(root: string): Promise<string[]> {
  const files = await gitFiles(root).catch(() => walkFiles(root))
  return files.slice(0, FILE_LIMIT)
}

/**
 * Cached file list, refreshed at most every `ttl` milliseconds.
 * @param root Project root.
 * @param ttl Cache lifetime.
 */
export function createProjectFileIndex(root: string, ttl = 10_000) {
  let cached: { at: number, files: Promise<string[]> } | undefined
  return {
    /** Current file list; concurrent callers share one listing. */
    files(): Promise<string[]> {
      if (!cached || Date.now() - cached.at > ttl) {
        const files = listProjectFiles(root)
        cached = { at: Date.now(), files }
        files.catch(() => {
          cached = undefined
        })
      }
      return cached.files
    },
  }
}

/**
 * Whether `query` letters appear in order within `text`.
 * @param text Lowercase candidate.
 * @param query Lowercase query.
 */
function subsequence(text: string, query: string): boolean {
  let index = 0
  for (const char of text) {
    if (char === query[index]) index++
    if (index === query.length) return true
  }
  return false
}

/**
 * Match tier, lower is better; `undefined` when the path does not match.
 * @param path Candidate path.
 * @param query Lowercase query.
 */
function tier(path: string, query: string): number | undefined {
  const name = basename(path).toLowerCase()
  const stem = name.split('.')[0]
  if (!query || name === query || stem === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (path.toLowerCase().includes(query)) return 3
  if (subsequence(path.toLowerCase(), query)) return 4
}

/**
 * Ranks files for an `@` mention: exact name, name prefix, name substring, path substring, then fuzzy; shorter paths first.
 * @param files Project-relative paths.
 * @param query User-typed text after `@`.
 * @param limit Maximum results.
 */
export function searchProjectFiles(files: readonly string[], query: string, limit = 20): UiProjectFile[] {
  const needle = query.trim().toLowerCase()
  const ranked: [number, string][] = []
  for (const path of files) {
    const rank = tier(path, needle)
    if (rank !== undefined) ranked.push([rank, path])
  }
  ranked.sort(([leftRank, left], [rightRank, right]) => leftRank - rightRank || left.length - right.length || left.localeCompare(right))
  return ranked.slice(0, limit).map(([, path]) => ({ path, basename: basename(path), dirname: dirname(path) === '.' ? '' : dirname(path) }))
}
