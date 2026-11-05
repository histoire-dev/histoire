import type { Context } from '../context.js'
import type { ParsedConfig } from './codemod/types.js'
import type { DisabledPluginMetadata, PluginSourceEntry } from './plugin-toggle-source.js'
import { randomUUID } from 'node:crypto'
import { histoireIconNames } from '@histoire/shared/dist/icons/index.js'
import { dirname } from 'pathe'
import { detectProjectSignals } from '../marketplace/catalog/signals.js'
import { packageNameFromSpecifier, pluginInventoryFlags, projectDependencies, readInstalledPackage, resolvePluginPackage } from '../marketplace/inventory/package-resolve.js'
import { locateConfigObject } from './codemod/locate.js'
import { parseConfigCode, unwrapNode } from './codemod/parse.js'
import { findProperty } from './codemod/walk.js'
import { configFileHash, hashConfigCode } from './codemod/write.js'
import { getPluginConfigSource, resolveConfigFile } from './load.js'
import { resolvePackageMetadata } from './plugin-metadata.js'
import { analyzePluginSource } from './plugin-toggle-source.js'

/** Safe row data sent to the workbench. */
export interface PluginInventoryRow extends DisabledPluginMetadata {
  /** Built-in plugins are not editable. */
  builtin: boolean
  /** Effective state in this runtime. */
  enabled: boolean
  /** Actual installed npm identity. */
  packageName?: string
  /** Installed version, or local for authored/workspace code. */
  version?: string
  /** Excluded from registry updates. */
  local: boolean
  /** Framework support or builtin, protected from marketplace removal. */
  required: boolean
  /** Bundled entry under the first-party npm scope. */
  official: boolean
  /** Exact dependency declaration; updates remain visible. */
  pinned?: boolean
  /** Generation-scoped identifier for a safely editable entry. */
  toggleId?: string
}

/** Private source evidence for one server generation. */
export interface PluginToggleInventory {
  /** Guarded config file. */
  file: string
  /** Revision of the captured config source. */
  hash: string
  /** Server-only source evaluated by this generation. */
  source: string
  /** Parsed plugin entries in source order. */
  entries: PluginSourceEntry[]
  /** Public rows in resolved order. */
  rows: PluginInventoryRow[]
  /** Rows corresponding to source entries in source order. */
  configured: PluginInventoryRow[]
  /** Server-owned mapping from opaque capabilities to entries. */
  targets: Map<string, { index: number, row: PluginInventoryRow, devOnly?: boolean }>
}

/** Projects resolved plugins and, where safely identified, disabled source entries. */
export async function createPluginInventory(ctx: Context): Promise<{ rows: PluginInventoryRow[], toggle?: PluginToggleInventory }> {
  const frameworks = (await detectProjectSignals(ctx)).project.frameworks
  const dependencies = new Map<string, ReturnType<typeof projectDependencies>>()
  const file = resolveConfigFile(ctx.root, ctx.configFile)
  const rows: PluginInventoryRow[] = (ctx.config.plugins ?? []).map((plugin, index) => ({
    name: plugin.name,
    builtin: plugin.name.startsWith('builtin:'),
    ...(plugin.workbench ? { id: plugin.workbench.id } : {}),
    client: Boolean(plugin.workbench?.client && !(ctx.mode === 'build' && plugin.workbench.devOnly)),
    frame: Boolean(plugin.workbench?.frame && !(ctx.mode === 'build' && plugin.workbench.devOnly)),
    ...ctx.pluginMetadata?.[index],
    ...pluginInventoryFlags(plugin),
    enabled: true,
  }))
  const enriched = new Set<PluginInventoryRow>()
  const metadata = new Map(rows.map((row, index) => [row, ctx.pluginMetadata?.[index]]))
  const captured = getPluginConfigSource(ctx.config)
  if (!captured || !file) return fallback()
  try {
    const hash = hashConfigCode(captured.source)
    if (await configFileHash(file, { root: ctx.root }) !== hash) return fallback()
    const entries = analyzePluginSource(captured.source)
    if (entries.filter(entry => entry.enabled).length !== captured.plugins.length) return fallback()
    const matches = captured.plugins.map(plugin => ctx.config.plugins.flatMap((item, index) => item === plugin ? [index] : []))
    if (matches.some(indices => indices.length !== 1) || new Set(matches.map(indices => indices[0])).size !== matches.length) return fallback()
    const specifiers = sourceSpecifiers(parseConfigCode(captured.source))
    const configured = await Promise.all(entries.map(async (entry, index) => {
      // analyzePluginSource already restricts entries to directly imported factories.
      const specifier = specifiers[index]
      if (entry.enabled) {
        const row = rows[matches.shift()![0]]
        await enrichRow(row, specifier)
        return row
      }
      const { devOnly, ...info } = entry.metadata!
      const icon = info.icon && histoireIconNames.includes(info.icon) ? info.icon : undefined
      const row: PluginInventoryRow = { ...info, icon, ...(ctx.mode === 'build' && devOnly ? { client: false, frame: false } : {}), builtin: info.name.startsWith('builtin:'), ...pluginInventoryFlags({ name: info.name }), enabled: false }
      await enrichRow(row, specifier)
      return row
    }))
    await Promise.all(rows.map(row => enrichRow(row)))
    // Place disabled rows next to their source neighbors without changing resolved active order.
    for (let index = 0; index < configured.length; index++) {
      if (entries[index].enabled) continue
      const next = configured.slice(index + 1).find(row => rows.includes(row))
      const previous = configured.slice(0, index).reverse().find(row => rows.includes(row))
      rows.splice(next ? rows.indexOf(next) : previous ? rows.indexOf(previous) + 1 : rows.length, 0, configured[index])
    }
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1)
    const targets = new Map<string, { index: number, row: PluginInventoryRow, devOnly?: boolean }>()
    if (ctx.mode === 'dev') {
      configured.forEach((row, index) => {
        if (row.builtin || counts.get(row.name) !== 1) return
        const id = randomUUID()
        row.toggleId = id
        const plugin = ctx.config.plugins.find(item => item.name === row.name)
        targets.set(id, { index, row, devOnly: plugin?.workbench?.devOnly })
      })
    }
    return { rows, toggle: { file, hash, source: captured.source, entries, rows, configured, targets } }
  }
  catch { return fallback() }

  /** Unsupported source still exposes fully enriched active plugins without toggle capabilities. */
  async function fallback(): Promise<{ rows: PluginInventoryRow[] }> {
    await Promise.all(rows.map(row => enrichRow(row)))
    return { rows }
  }

  /** Read safe package metadata only; disabled factories remain unevaluated. */
  async function enrichRow(row: PluginInventoryRow, specifier?: string): Promise<void> {
    if (enriched.has(row)) return
    enriched.add(row)
    const root = specifier && file ? dirname(file) : ctx.root
    const packageName = packageNameFromSpecifier(specifier ?? row.name)
    const data = packageName ? await readInstalledPackage(root, packageName) : {}
    // Nested configs may have closer declarations than the project root. Share
    // one dependency walk per resolution root without losing that precedence.
    const declarations = dependencies.get(root) ?? projectDependencies(root)
    dependencies.set(root, declarations)
    const resolved = await resolvePluginPackage(root, row.name, specifier, frameworks, { dependencies: await declarations, package: data })
    const capturedMetadata = metadata.get(row)
    const info = capturedMetadata && packageName === row.name
      ? capturedMetadata
      : { ...(packageName ? resolvePackageMetadata({ name: packageName }, data) : {}), ...capturedMetadata }
    const { packageName: _packageName, version: _version, ...publicInfo } = info
    // Relative source imports override coincidentally matching installed package names.
    delete row.packageName
    delete row.version
    Object.assign(row, { ...publicInfo, ...row, ...resolved })
  }
}

/** Read imported factories from the parsed array already admitted by analyzePluginSource. */
function sourceSpecifiers(parsed: ParsedConfig): Array<string | undefined> {
  const config = locateConfigObject(parsed)
  if (!config.object) return []
  const property = findProperty(config.object, 'plugins').property
  if (!property) return []
  const array = unwrapNode(property.value)
  if (array.type !== 'ArrayExpression') return []
  return array.elements.map((entry) => {
    if (!entry) return undefined
    let call = unwrapNode(entry)
    // Disabled entries retain the imported call inside their false conditional wrapper.
    if (call.type === 'SpreadElement') {
      const conditional = unwrapNode(call.argument)
      if (conditional.type !== 'ConditionalExpression' || conditional.consequent.type !== 'ArrayExpression' || !conditional.consequent.elements[0]) return undefined
      call = unwrapNode(conditional.consequent.elements[0])
    }
    return call.type === 'CallExpression' && call.callee.type === 'Identifier' ? parsed.imports.get(call.callee.name) : undefined
  })
}
