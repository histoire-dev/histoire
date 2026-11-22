import type { CatalogPage } from '@histoire/shared'
import type { Context } from '../../context.js'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { packageName } from './validation.js'

/** Actual installed versions and public project chips. */
export interface ProjectSignals {
  /** Browser-safe framework and dependency chips. */ project: CatalogPage['project']
  /** Actual installed package versions, never dependency ranges. */ versions: Record<string, string>
  /** Declared dependency names used by recommendation rules. */ dependencies: string[]
}
/** Object identity bounds captured evidence to a configuration generation. */
export type ProjectContext = Pick<Context, 'root'>
/** Shared dependency discovery and per-name installed-version work. */
interface SignalState {
  /** One package.json read for this generation. */ project: Promise<ProjectSignals>
  /** Missing packages are memoized too, avoiding repeated filesystem walks. */ reads: Map<string, Promise<void>>
}
/** Contexts disappear with their runtime generation. */
const states = new WeakMap<ProjectContext, SignalState>()

/** Read dependency names without walking installed packages or evaluating code. */
async function projectSignals(root: string): Promise<ProjectSignals> {
  let pkg: Record<string, any> = {}
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) ?? {}
  }
  catch { /* Missing package.json is a valid empty project. */ }
  const dependencies = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])].filter(name => packageName.safeParse(name).success)
  const frameworks = ['vue', 'react', 'svelte'].filter(name => dependencies.includes(name))
  const signals = ['vitest', 'tailwindcss'].filter(name => dependencies.includes(name))
  return { project: { frameworks, signals }, versions: Object.create(null), dependencies }
}

/** Capture project evidence once; resolve only peers currently consulted and the Vite chip. */
export async function detectProjectSignals(context: ProjectContext | string, requires: Iterable<string> = [], inspectAllPeers = false): Promise<ProjectSignals> {
  // Root-only callers have no generation lifetime; owned consumers pass their context.
  const ctx = typeof context === 'string' ? { root: context } : context
  let state = states.get(ctx)
  if (!state) {
    state = { project: projectSignals(ctx.root), reads: new Map() }
    states.set(ctx, state)
  }
  const project = await state.project
  // Hosted peer ranges apply to root-resolvable packages, including hoisted peers.
  const peers = [...requires].filter(name => name !== 'histoire' && (inspectAllPeers || project.dependencies.includes(name)))
  const hasViteDependency = project.dependencies.includes('vite')
  if (hasViteDependency) peers.push('vite')
  await Promise.all([...new Set(peers)].map((name) => {
    let read = state.reads.get(name)
    if (!read) {
      read = readInstalledPackage(ctx.root, name).then((pkg) => {
        if (typeof pkg.version === 'string') project.versions[name] = pkg.version
        if (name === 'vite' && hasViteDependency && /^\d+\./.test(project.versions.vite ?? '')) project.project.signals.push(`vite ${project.versions.vite.split('.')[0]}`)
      })
      state.reads.set(name, read)
    }
    return read
  }))
  return project
}
