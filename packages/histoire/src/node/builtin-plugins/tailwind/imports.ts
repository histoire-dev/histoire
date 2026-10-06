import type { PluginApiBase } from '@histoire/shared'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'pathe'
import postcss from 'postcss'

/** CSS dependency with reference-only imports distinguished from live entries. */
interface CssImport {
  /** Import request. */
  id: string
  /** Whether directive only supplies reference metadata. */
  reference: boolean
}

/** Read quoted imports using CSS parser; tolerant scan preserves compiler errors. */
export function readCssImports(css: string): CssImport[] {
  const imports: CssImport[] = []
  try {
    postcss.parse(css).walkAtRules(/^(?:import|reference)$/, (rule) => {
      const id = rule.params.match(/^(?:url\()?\s*['"]([^'"]+)['"]/)?.[1]
      if (id) imports.push({ id, reference: rule.name === 'reference' || /\breference\b/.test(rule.params) })
    })
  }
  catch {
    for (const match of css.matchAll(/@(import|reference)\s+['"]([^'"]+)['"]/g)) imports.push({ id: match[2], reference: match[1] === 'reference' })
  }
  return imports
}

/** Vite resolution first, with filesystem/package fallback for custom module loaders. */
export async function resolveCssImport(api: PluginApiBase, id: string, importer: string): Promise<string | null> {
  const vite = await api.moduleLoader.resolveId?.(id, importer)
  if (vite) return vite
  if (id.startsWith('.') || isAbsolute(id)) return resolve(dirname(importer), id)
  if (/^(?:https?:|data:)/.test(id)) return null
  const require = createRequire(importer)
  try {
    const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]
    if (id === packageName) {
      const packageFile = require.resolve(`${packageName}/package.json`)
      const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
      if (pkg.style) return resolve(dirname(packageFile), pkg.style)
    }
    return require.resolve(id)
  }
  catch { return null }
}

/** Preserve asset ownership when compiled CSS moves into generated output. */
export async function loadTailwindCss(api: PluginApiBase, file: string, dependencies: Set<string>): Promise<string> {
  dependencies.add(file)
  const loaded = api.moduleLoader.loadSource
    ? await api.moduleLoader.loadSource(file)
    : { code: await readFile(file, 'utf8'), dependencies: [] }
  for (const dependency of loaded.dependencies) dependencies.add(dependency)
  const css = postcss.parse(loaded.code, { from: file })
  css.walkDecls((declaration) => {
    declaration.value = declaration.value.replace(/url\(([^)]*)\)/g, (original, value) => {
      const url = value.trim().replace(/^["']|["']$/g, '')
      if (!url || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)) return original
      const absolute = resolve(dirname(file), url)
      dependencies.add(absolute.split(/[?#]/)[0])
      return `url(${JSON.stringify(absolute)})`
    })
  })
  return css.toString()
}

/** Shared v4 compiler loaders record every imported source and failed file candidate. */
export function createTailwindLoaders(api: PluginApiBase, source: string, dependencies: Set<string>) {
  return {
    base: dirname(source),
    /** Resolve raw CSS; do not execute transformed browser CSS modules. */
    async loadStylesheet(id: string, base: string) {
      const file = await resolveCssImport(api, id, resolve(base, '__tailwind.css'))
      if (!file) throw new Error(`Cannot resolve Tailwind stylesheet "${id}" from ${base}`)
      return { path: file, base: dirname(file), content: await loadTailwindCss(api, file, dependencies) }
    },
    /** Execute compatibility plugins/configs through owning Vite module loader. */
    async loadModule(id: string, base: string) {
      const importer = resolve(base, '__tailwind.js')
      if (id.startsWith('.') || isAbsolute(id)) dependencies.add(resolve(base, id))
      const file = await api.moduleLoader.resolveId?.(id, importer)
        ?? createRequire(importer).resolve(id)
      dependencies.add(file)
      try {
        const module = await api.moduleLoader.loadModule(file)
        if (!module) throw new Error(`Cannot load Tailwind module ${file}`)
        return { path: file, base: dirname(file), module: module.default ?? module }
      }
      finally {
        // Failed execution still records imports in Vite's graph. Keep them so
        // repairing a nested config/plugin module can trigger regeneration.
        for (const dependency of api.moduleLoader.getDependencies?.(file) ?? []) dependencies.add(dependency)
      }
    },
  }
}
