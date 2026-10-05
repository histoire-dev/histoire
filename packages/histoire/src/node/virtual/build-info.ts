import type { HistoireBuildInfo } from '@histoire/shared'
import type { Context } from '../context.js'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'pathe'

/** Testable project readers; production uses bounded git subprocesses. */
interface BuildInfoReaders {
  /** Package manifest reader. */
  readPackage?: () => Promise<{ version?: unknown }>
  /** Git argument array, executed without a shell. */
  git?: (args: string[]) => Promise<string>
  /** Generation timestamp factory. */
  now?: () => string
}

const execute = promisify(execFile)
const timestamps = new WeakMap<Context, string>()

/** Parse repository-relative NUL records into project paths, preserving filename whitespace. */
function changedFiles(output: string, dev: boolean, prefix: string) {
  const records = output.split('\0')
  const files = new Map<string, 'new' | 'changed'>()
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (!record) continue
    const status = dev ? record.slice(0, 2) : record
    let file = dev ? record.slice(3) : records[++index]
    if (/R|C/.test(status)) {
      // Porcelain lists destination then source; diff lists source then destination.
      const renamed = records[++index]
      if (!dev) file = renamed
    }
    if (file && file.startsWith(prefix) && !status.includes('D')) files.set(file.slice(prefix.length), status.includes('A') || status === '??' ? 'new' : 'changed')
  }
  return files
}

/** Collect optional metadata without requiring git or a package manifest. */
export async function collectWorkbenchBuildInfo(ctx: Context, readers: BuildInfoReaders = {}): Promise<HistoireBuildInfo> {
  let builtAt = timestamps.get(ctx)
  if (!builtAt) {
    builtAt = readers.now?.() ?? new Date().toISOString()
    timestamps.set(ctx, builtAt)
  }
  const info: HistoireBuildInfo = { builtAt }
  const git = readers.git ?? (async (args: string[]) => (await execute('git', args, { cwd: ctx.root, timeout: 2000, maxBuffer: 1024 * 1024, encoding: 'utf8' })).stdout)
  const optional = async <T>(read: () => Promise<T>) => read().catch(() => undefined)
  const [manifest, commit, branch, prefix] = await Promise.all([
    optional(readers.readPackage ?? (async () => JSON.parse(await readFile(join(ctx.root, 'package.json'), 'utf8')))),
    optional(() => git(['rev-parse', 'HEAD'])),
    optional(() => git(['rev-parse', '--abbrev-ref', 'HEAD'])),
    optional(() => git(['rev-parse', '--show-prefix'])),
  ])
  if (typeof manifest?.version === 'string') info.version = manifest.version
  if (commit?.trim()) info.commit = commit.trim()
  if (branch?.trim() && branch.trim() !== 'HEAD') info.branch = branch.trim()
  const since = ctx.config.build?.changedSince
  if (prefix !== undefined && (ctx.mode === 'dev' || (since && !since.startsWith('-')))) {
    const output = await optional(() => git(ctx.mode === 'dev'
      ? ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']
      : ['diff', '--name-status', '-z', since, '--', '.']))
    if (output !== undefined) {
      // Git's prefix already includes its separator; remove only command's final newline.
      const files = changedFiles(output, ctx.mode === 'dev', prefix.replace(/\r?\n$/, ''))
      info.changed = ctx.storyFiles.flatMap(file => file.story && files.has(file.relativePath)
        ? [{ storyId: file.story.id, kind: files.get(file.relativePath)! }]
        : [])
    }
  }
  return info
}

/** Virtual module shares metadata with generated histoire.json. */
export async function resolvedBuildInfo(ctx: Context): Promise<string> {
  return `export let buildInfo = ${JSON.stringify(await collectWorkbenchBuildInfo(ctx))}
// Keep subscriptions through module replacement; original owner can still detach.
const handlers = import.meta.hot
  ? (import.meta.hot.data.histoireBuildInfoHandlers ??= new Set())
  : new Set()
/** Observe source-owned metadata without remounting the current workbench. */
export function onBuildInfoUpdate(listener) {
  handlers.add(listener)
  return () => handlers.delete(listener)
}
if (import.meta.hot) {
  import.meta.hot.accept(next => {
    if (!next) return
    buildInfo = next.buildInfo
    for (const handler of [...handlers]) {
      if (handlers.has(handler)) handler(buildInfo)
    }
  })
}
`
}
