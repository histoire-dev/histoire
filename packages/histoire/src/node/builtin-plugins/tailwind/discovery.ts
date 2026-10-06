import type { PluginApiBase } from '@histoire/shared'
import type { TailwindEngine, TailwindSource, TailwindTokensOptions } from './types.js'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { globby } from 'globby'
import { relative, resolve } from 'pathe'
import { findUp } from '../../util/find-up.js'
import { tryResolveDependency } from '../../util/resolve-package.js'
import { readCssImports, resolveCssImport } from './imports.js'

/** Explicit directories excluded from automatic input discovery. */
export const excludedTailwindDirectories = new Set(['node_modules', '.git', '.nuxt', '.output', '.histoire', '.cache', 'coverage', 'dist'])

/** Resolve exactly the project's compiler; optional projects never inherit ours. */
export async function resolveTailwindEngine(root: string): Promise<TailwindEngine | null> {
  const packageFile = tryResolveDependency(root, 'tailwindcss/package.json', { fallback: false })
  if (!packageFile) return null
  const { version } = JSON.parse(await readFile(packageFile, 'utf8'))
  const major = Number(version.split('.')[0])
  if (major !== 3 && major !== 4) throw new Error(`Unsupported Tailwind CSS version ${version}; expected v3 or v4`)
  return { major, version, entry: tryResolveDependency(root, 'tailwindcss', { fallback: false })! }
}

/** Build stable portable identity, independent of catalog ordering and siblings. */
function sourceFor(root: string, path: string, major: 3 | 4): TailwindSource {
  const relativePath = relative(root, path)
  const id = major === 3 ? 'tailwind' : `tailwind-css-${createHash('sha256').update(relativePath).digest('hex').slice(0, 12)}`
  return { id, path, relativePath, title: 'Tailwind' }
}

/** Discover independent roots; imported partials and reference-only files stay dependencies. */
export async function discoverTailwindSources(api: PluginApiBase, engine: TailwindEngine, options: TailwindTokensOptions): Promise<TailwindSource[]> {
  if (engine.major === 3) {
    if (options.cssFile) throw new Error('cssFile requires Tailwind CSS v4; use configFile for v3')
    const file = options.configFile
      ? resolve(api.root, options.configFile)
      : findUp(api.root, ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts', 'tailwind-config.js', 'tailwind-config.cjs', 'tailwind-config.mjs', 'tailwind-config.ts'])
    return file ? [sourceFor(api.root, file, 3)] : []
  }
  if (options.configFile) throw new Error('configFile requires Tailwind CSS v3; use @config in a v4 CSS entry')
  if (options.cssFile) {
    const files = [...new Set([options.cssFile].flat().map(file => resolve(api.root, file)))].sort()
    return labelSources(files.map(file => sourceFor(api.root, file, 4)))
  }
  const files = await globby(['**/*.{css,pcss,postcss}'], {
    cwd: api.root,
    absolute: true,
    ignore: [...excludedTailwindDirectories].map(dir => `**/${dir}/**`),
  })
  const output = api.getConfig().outDir
  const inputs = files.filter(file => !output || !file.startsWith(`${resolve(api.root, output)}/`)).sort()
  const graph = new Map<string, { imports: string[], tailwind: boolean }>()
  const imported = new Set<string>()
  for (const file of inputs) {
    // A malformed selected input must reach the adapter and fail visibly. Scan
    // imports tolerantly here; compiler owns authoritative syntax validation.
    const css = await readFile(file, 'utf8')
    const imports = readCssImports(css)
    const dependencies: string[] = []
    for (const entry of imports.filter(entry => !entry.reference)) {
      const dependency = await resolveCssImport(api, entry.id, file)
      if (dependency && inputs.includes(dependency)) {
        dependencies.push(dependency)
        imported.add(dependency)
      }
    }
    graph.set(file, { imports: dependencies, tailwind: imports.some(entry => !entry.reference && /^tailwindcss(?:\/|$)/.test(entry.id)) || /@theme\b/.test(css) })
  }
  /** Follow local root imports without looping through cyclic stylesheets. */
  function usesTailwind(file: string, seen = new Set<string>()): boolean {
    if (seen.has(file)) return false
    seen.add(file)
    const item = graph.get(file)
    return !!item && (item.tailwind || item.imports.some(dependency => usesTailwind(dependency, seen)))
  }
  return labelSources(inputs.filter(file => !imported.has(file) && usesTailwind(file)).map(file => sourceFor(api.root, file, 4)))
}

/** Source labels become explicit only when several independent themes exist. */
function labelSources(sources: TailwindSource[]) {
  return sources.map(source => ({ ...source, title: sources.length === 1 ? 'Tailwind' : `Tailwind/${source.relativePath}` }))
}
