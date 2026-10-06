import type { PluginApiBase } from '@histoire/shared'
import type { TailwindEngine, TailwindGeneration, TailwindSource, TailwindTokenCategory } from './types.js'
import postcss from 'postcss'
import { importResolvedModule } from '../../util/import-resolved.js'
import { categories, styleProperty } from './categories.js'
import { scopeTailwindCss } from './css.js'
import { createTailwindLoaders, loadTailwindCss } from './imports.js'

/** Guarded boundary around upstream's explicitly unstable design-system API. */
export async function generateV4(api: PluginApiBase, engine: TailwindEngine, source: TailwindSource, dependencies: Set<string>): Promise<TailwindGeneration> {
  const imported = await importResolvedModule(engine.entry)
  const compiler = imported.__unstable__loadDesignSystem ? imported : imported.default
  if (typeof compiler?.__unstable__loadDesignSystem !== 'function' || typeof compiler.compile !== 'function') throw new Error(`Tailwind CSS ${engine.version} does not expose supported design-system APIs`)
  const css = await loadTailwindCss(api, source.path, dependencies)
  const loaders = createTailwindLoaders(api, source.path, dependencies)
  const system = await compiler.__unstable__loadDesignSystem(css, loaders)
  if (typeof system?.theme?.entries !== 'function' || typeof system.getClassList !== 'function' || typeof system.candidatesToCss !== 'function') throw new Error(`Unsupported Tailwind CSS ${engine.version} design-system shape`)
  const variables: Record<string, string> = {}
  for (const [key, entry] of system.theme.entries()) {
    if (typeof key !== 'string' || typeof entry?.value !== 'string') throw new Error(`Unsupported Tailwind CSS ${engine.version} theme entry`)
    variables[key] = entry.value
  }
  const prefix = system.theme.prefix ? `${system.theme.prefix}:` : ''
  const supported = categories.filter(category => category.stem)
  const suggestions = system.getClassList().map(([name]) => name as string).filter(name => supported.some(category => name === category.stem || name.startsWith(`${category.stem}-`)))
  const classNames = suggestions.map(name => `${prefix}${name}`)
  const compiled: (string | null)[] = system.candidatesToCss(classNames)
  const resolved: TailwindTokenCategory[] = categories.map(category => ({ id: category.id, title: category.title, kind: category.kind, tokens: [] }))
  for (let index = 0; index < suggestions.length; index++) {
    if (!compiled[index]) continue
    const declarations: Record<string, string> = {}
    postcss.parse(compiled[index]!).walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value
    })
    for (const definition of supported) {
      const candidate = suggestions[index]
      if (candidate !== definition.stem && !candidate.startsWith(`${definition.stem}-`)) continue
      if (!declarations[definition.property]) continue
      const value = declarations[definition.property]
      const variable = value.match(/var\((--[\w-]+)/)?.[1]
      const category = resolved.find(category => category.id === definition.id)!
      category.tokens.push({
        key: candidate === definition.stem ? 'DEFAULT' : candidate.slice(definition.stem.length + 1),
        name: classNames[index],
        utility: classNames[index],
        value: variable && variables[variable] !== undefined ? variables[variable] : value,
        cssVariable: variable && variables[variable] !== undefined ? variable : undefined,
        preview: Object.fromEntries(Object.entries(declarations).map(([key, value]) => [styleProperty(key), value])),
      })
    }
  }
  const variablePrefix = system.theme.prefix ? `--${system.theme.prefix}-` : '--'
  const breakpoints = resolved.find(category => category.id === 'breakpoints')!
  for (const [key, value] of Object.entries(variables)) {
    if (key.startsWith(`${variablePrefix}breakpoint-`)) breakpoints.tokens.push({ key, name: key.slice(`${variablePrefix}breakpoint-`.length), value, cssVariable: key, preview: {} })
  }
  const spacing = resolved.find(category => category.id === 'spacing')!
  const base = `${variablePrefix}spacing`
  if (variables[base]) spacing.tokens.unshift({ key: 'base', name: base, value: variables[base], cssVariable: base, preview: { width: `var(${base})` } })
  const build = await compiler.compile(css, loaders)
  const output = scopeTailwindCss(build.build(classNames), source.id, new Set(classNames), variables)
  return {
    snapshot: { source: { ...source, path: source.relativePath }, version: engine.version, prefix, categories: resolved.filter(category => category.tokens.length), config: { version: engine.version, source: source.relativePath, prefix, theme: variables } },
    css: output,
    dependencies: [...dependencies],
  }
}
