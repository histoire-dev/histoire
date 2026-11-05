import type { CatalogPage } from '@histoire/shared'
import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import { findProjectPackageDirectories } from '../../util/resolve-package.js'
import { packageName } from './validation.js'

/** Actual installed versions and public project chips. */
export interface ProjectSignals {
  /** Browser-safe framework and dependency chips. */ project: CatalogPage['project']
  /** Actual installed package versions, never dependency ranges. */ versions: Record<string, string>
  /** Declared dependency names used by recommendation rules. */ dependencies: string[]
}
/** Detect stack without importing or executing installed packages. */
export async function detectProjectSignals(root: string): Promise<ProjectSignals> {
  let pkg: Record<string, any> = {}
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) ?? {}
  }
  catch { /* Missing package.json is a valid empty project. */ }
  const dependencies = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])].filter(name => packageName.safeParse(name).success)
  const versions: Record<string, string> = Object.create(null)
  await Promise.all(dependencies.map(async (name) => {
    try {
      const directory = findProjectPackageDirectories(root, name)[0]
      if (!directory) return
      const installed = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (installed.name === name && typeof installed.version === 'string') versions[name] = installed.version
    }
    catch { /* An unresolved declaration is never an installed version. */ }
  }))
  const frameworks = ['vue', 'react', 'svelte'].filter(name => dependencies.includes(name) || versions[name])
  const signals = ['vitest', 'tailwindcss'].filter(name => dependencies.includes(name))
  if (versions.vite && /^\d+\./.test(versions.vite)) signals.push(`vite ${versions.vite.split('.')[0]}`)
  return { project: { frameworks, signals }, versions, dependencies }
}
