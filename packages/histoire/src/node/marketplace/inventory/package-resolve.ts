import type { MarketplaceManifest, Plugin } from '@histoire/shared'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'pathe'
import { findProjectPackageDirectories } from '../../util/resolve-package.js'
import { officialPlugins } from '../catalog/official.js'
import { detectProjectSignals } from '../catalog/signals.js'
import { packageName as packageNameSchema } from '../catalog/validation.js'
import { exactVersion } from '../changes/validation.js'
import { validateMarketplaceManifest } from '../manifest/index.js'

/** Resolved public package identity; no filesystem locations cross the channel. */
export interface InstalledPackage {
  /** Installed npm identity, when resolvable. */ packageName?: string
  /** Installed package version, or local for authored/workspace code. */ version?: string
  /** Authored or workspace dependency, excluded from registry updates. */ local: boolean
  /** Bundled identity under the first-party npm scope. */ official: boolean
  /** Exact dependency version, still eligible for update notifications. */ pinned: boolean
  /** Builtin or framework support matching this project. */ required: boolean
}

/** Admit exact npm identities, excluding path traversal and URL specifiers. */
export function packageNameFromSpecifier(value: string): string | undefined {
  if (value.length > 500 || isAbsolute(value) || value.startsWith('.')) return
  const name = value.split('/').slice(0, value.startsWith('@') ? 2 : 1).join('/')
  return packageNameSchema.safeParse(name).success ? name : undefined
}

/** Read JSON data only; malformed or missing files provide no package evidence. */
async function readPackageJson(file: string): Promise<Record<string, any>> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  }
  catch { return {} }
}

/** Read the nearest installed copy, requiring its manifest to match the lookup identity. */
export async function readInstalledPackage(root: string, name: string): Promise<Record<string, any>> {
  if (packageNameFromSpecifier(name) !== name) return {}
  const directory = findProjectPackageDirectories(root, name)[0]
  if (!directory) return {}
  const data = await readPackageJson(join(directory, 'package.json'))
  return data.name === name ? data : {}
}

/** Nearest declaration wins, including workspace-root declarations inherited by child packages. */
export async function projectDependencies(root: string): Promise<Record<string, string>> {
  const dependencies: Record<string, string> = {}
  let directory = root
  while (true) {
    const data = await readPackageJson(join(directory, 'package.json'))
    for (const group of ['devDependencies', 'dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, range] of Object.entries(data[group] ?? {})) {
        if (typeof range === 'string' && !Object.hasOwn(dependencies, name)) dependencies[name] = range
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return dependencies
    directory = parent
  }
}

/** Framework metadata comes from validated local JSON or the bundled official manifest. */
function packageManifest(name: string, data: Record<string, any>): MarketplaceManifest | undefined {
  return validateMarketplaceManifest(data.histoire?.marketplace).manifest
    ?? officialPlugins.find(entry => entry.id === name)?.manifest
}

/** Resolve aliases through source specifiers, keeping project ranges separate from installed bytes. */
export async function resolvePluginPackage(root: string, name: string, specifier?: string, frameworks?: readonly string[], inputs: PackageResolutionInputs = {}): Promise<InstalledPackage> {
  const builtin = name.startsWith('builtin:')
  const packageName = packageNameFromSpecifier(specifier ?? name)
  const data = inputs.package ?? (packageName ? await readInstalledPackage(root, packageName) : {})
  const dependencies = inputs.dependencies ?? await projectDependencies(root)
  const range = packageName ? dependencies[packageName] : undefined
  const installedVersion = typeof data.version === 'string' && data.version.length <= 128 ? data.version : undefined
  const local = !builtin && (!packageName || !installedVersion || /^(?:workspace:|file:|link:)/.test(range ?? ''))
  const manifest = packageName ? packageManifest(packageName, data) : undefined
  const detected = frameworks ?? (await detectProjectSignals(root)).project.frameworks
  return {
    ...(packageName && data.name ? { packageName } : {}),
    ...(local ? { version: 'local' } : installedVersion ? { version: installedVersion } : {}),
    local,
    official: Boolean(officialPlugins.find(entry => entry.id === packageName)?.official),
    pinned: exactVersion.safeParse(range).success,
    required: builtin || Boolean(manifest?.category === 'frameworks' && manifest.frameworks?.some(framework => detected.includes(framework))),
  }
}

/** Inventory-scoped evidence avoids rereading dependencies and installed JSON per projection. */
export interface PackageResolutionInputs {
  /** Nearest project declarations, captured once for all inventory rows. */ dependencies?: Readonly<Record<string, string>>
  /** Identity-checked package JSON, shared with metadata projection. */ package?: Record<string, any>
}

/** Synchronous fallback for callers rendering a virtual module without a captured inventory. */
export function pluginInventoryFlags(plugin: Plugin): Pick<InstalledPackage, 'local' | 'required' | 'official'> {
  const builtin = plugin.name.startsWith('builtin:')
  return { local: !builtin, required: builtin || Boolean(plugin.supportPlugin), official: Boolean(officialPlugins.find(entry => entry.id === plugin.name)?.official) }
}
