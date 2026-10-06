import type { PluginApiBase } from '@histoire/shared'
import type { CategoryDefinition } from './categories.js'
import type { TailwindEngine, TailwindGeneration, TailwindSource, TailwindToken } from './types.js'
import { importResolvedModule } from '../../util/import-resolved.js'
import { tryResolveDependency } from '../../util/resolve-package.js'
import { categories, serializableConfig, styleProperty } from './categories.js'

/** Flatten color namespaces while retaining scalar DEFAULT leaves and skipping nulls. */
function flattenColors(value: unknown, key = '', result: Record<string, unknown> = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [child, color] of Object.entries(value)) flattenColors(color, child === 'DEFAULT' ? key : [key, child].filter(Boolean).join('-'), result)
  }
  else if (value !== null && value !== undefined) {
    result[key || 'DEFAULT'] = value
  }
  return result
}

/** Normalize only presentation declarations; copied token values retain original shape. */
function declarations(category: CategoryDefinition, value: any): Record<string, string> {
  if (category.id === 'breakpoints') return {}
  if (category.id === 'font-size' && Array.isArray(value)) {
    const metadata = typeof value[1] === 'object' ? value[1] : value[1] ? { lineHeight: value[1] } : {}
    return Object.fromEntries(Object.entries({ fontSize: value[0], ...metadata }).map(([key, item]) => [key, String(item)]))
  }
  if (category.id === 'drop-shadow') return { filter: [value].flat().map(item => `drop-shadow(${item})`).join(' ') }
  if (category.id === 'font-family') {
    // Tailwind accepts either a family list or [families, metadata]. Only the
    // latter carries feature/variation settings; never join metadata into CSS.
    const tuple = Array.isArray(value) && value[1] && typeof value[1] === 'object' && !Array.isArray(value[1])
    const [families, metadata] = tuple ? value : [value, {}]
    const result = { fontFamily: Array.isArray(families) ? families.join(', ') : String(families) }
    for (const property of ['fontFeatureSettings', 'fontVariationSettings']) {
      if (metadata[property] !== undefined) result[property] = String(metadata[property])
    }
    return result
  }
  const normalized = Array.isArray(value) ? value.join(', ') : String(value)
  return { [styleProperty(category.property)]: normalized.replaceAll('<alpha-value>', '1') }
}

/** Resolve project v3 configuration and materialize its supported design token categories. */
export async function generateV3(api: PluginApiBase, engine: TailwindEngine, source: TailwindSource): Promise<TailwindGeneration> {
  const loaded = await api.moduleLoader.loadModule(source.path)
  if (!loaded) throw new Error(`Cannot load Tailwind configuration ${source.relativePath}`)
  const entry = tryResolveDependency(api.root, 'tailwindcss/resolveConfig.js', { fallback: false })
  if (!entry) throw new Error(`Cannot resolve Tailwind v3 resolveConfig from ${api.root}`)
  const module = await importResolvedModule(entry)
  const config = (module.default ?? module)(loaded.default ?? loaded)
  const prefix = config.prefix ?? ''
  const resolved = categories.filter(category => category.id !== 'spacing').map((category) => {
    const raw = config.theme?.[category.theme] ?? {}
    const values = category.kind.includes('color') ? flattenColors(raw) : raw
    const tokens: TailwindToken[] = []
    for (const [key, original] of Object.entries(values)) {
      let value = original
      if (typeof value === 'function') {
        try {
          value = value({ opacityValue: '1', opacityVariable: undefined })
        }
        catch (error) {
          api.warn(`Cannot render Tailwind token ${category.id}/${key}: ${String(error)}`)
          continue
        }
      }
      if (value === undefined || value === null || typeof value === 'function') continue
      const utility = category.stem ? `${prefix}${category.stem}${key === 'DEFAULT' ? '' : `-${key}`}` : undefined
      tokens.push({ key, name: utility ?? key, utility, value: serializableConfig(value), preview: declarations(category, value) })
    }
    return { id: category.id, title: category.title, kind: category.kind, tokens }
  }).filter(category => category.tokens.length)
  return {
    snapshot: { source: { ...source, path: source.relativePath }, version: engine.version, prefix, categories: resolved, config: serializableConfig(config) },
    css: '',
    dependencies: [source.path, ...api.moduleLoader.getDependencies?.(source.path) ?? []],
  }
}
