import { dirname, join, relative } from 'pathe'

/** Output chunk surface read and rewritten by the facade pass. */
export interface FacadeOutputChunk {
  /** Discriminates chunks from emitted assets. */
  type: 'chunk'
  /** Bundle-relative output path. */
  fileName: string
  /** Rendered chunk code, rewritten in place. */
  code: string
  /** True when the chunk is the target of a dynamic `import()`. */
  isDynamicEntry?: boolean
}

/** Bundle map shape shared by Rollup and Rolldown `generateBundle` hooks. */
export type FacadeOutputBundle = Record<string, FacadeOutputChunk | { type: 'asset' }>

/** Public export reachable through one dynamic facade chunk. */
interface FacadeExport {
  /** Facade chunk output path. */
  fileName: string
  /** Original export name exposed by the facade. */
  name: string
}

/** `export { a as b } from "./inner.js";` statements, the only content of a pure facade. */
const REEXPORT = /export\s*\{([^}]*)\}\s*from\s*"([^"]+)";?/g
/** Named static imports as rendered by the bundler. */
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*"(\.{1,2}\/[^"]+)";?/g
/** Bundler banner comments left in an otherwise empty facade. */
const COMMENTS = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/**
 * Rolldown renders a dynamically imported module that also has static importers
 * as a shared chunk with mangled exports plus a re-export facade for `import()`.
 * Vitest mocks in built stories intercept the facade URL, while static importers
 * still bind the inner chunk and keep the original module. Route those static
 * imports through the facade so every consumer shares the mockable URL; facade
 * re-exports are live bindings, so module semantics stay unchanged.
 * @param bundle Output bundle from `generateBundle`, rewritten in place.
 */
export function routeImportsThroughDynamicFacades(bundle: FacadeOutputBundle): void {
  const chunks = Object.values(bundle).filter((item): item is FacadeOutputChunk => item.type === 'chunk')
  const facades = collectFacadeExports(chunks)
  if (!facades.size) return
  for (const chunk of chunks) {
    chunk.code = chunk.code.replace(NAMED_IMPORT, (statement, list: string, specifier: string) => {
      const target = facades.get(join(dirname(chunk.fileName), specifier))
      if (!target) return statement
      return rewriteImport(chunk.fileName, specifier, parseSpecifiers(list), target) ?? statement
    })
  }
}

/** Maps inner chunk path to its exports exposed by pure dynamic facades. */
function collectFacadeExports(chunks: FacadeOutputChunk[]): Map<string, Map<string, FacadeExport>> {
  const facades = new Map<string, Map<string, FacadeExport>>()
  for (const chunk of chunks) {
    if (!chunk.isDynamicEntry || chunk.code.replace(REEXPORT, '').replace(COMMENTS, '').trim()) continue
    for (const [, list, specifier] of chunk.code.matchAll(REEXPORT)) {
      const inner = join(dirname(chunk.fileName), specifier)
      const exports = facades.get(inner) ?? new Map<string, FacadeExport>()
      for (const [innerName, name] of parseSpecifiers(list)) {
        // First facade wins; any facade exposing a binding is a valid mock route.
        if (!exports.has(innerName)) exports.set(innerName, { fileName: chunk.fileName, name })
      }
      facades.set(inner, exports)
    }
  }
  return facades
}

/** Splits one import statement into kept inner bindings and per-facade imports. */
function rewriteImport(importer: string, specifier: string, bindings: Array<[string, string]>, target: Map<string, FacadeExport>): string | undefined {
  const kept: string[] = []
  const routed = new Map<string, string[]>()
  for (const [imported, local] of bindings) {
    const facade = target.get(imported)
    if (!facade) {
      kept.push(formatBinding(imported, local))
      continue
    }
    const list = routed.get(facade.fileName) ?? []
    list.push(formatBinding(facade.name, local))
    routed.set(facade.fileName, list)
  }
  if (!routed.size) return undefined
  const statements = kept.length ? [`import { ${kept.join(', ')} } from "${specifier}";`] : []
  for (const [fileName, list] of routed) {
    statements.push(`import { ${list.join(', ')} } from "${relativeSpecifier(importer, fileName)}";`)
  }
  return statements.join('')
}

/** Parses `a as b, c` into `[imported, local]` pairs. */
function parseSpecifiers(list: string): Array<[string, string]> {
  return list.split(',').map(item => item.trim()).filter(Boolean).map((item) => {
    const [imported, local = imported] = item.split(/\s+as\s+/)
    return [imported.trim(), local.trim()]
  })
}

/** Renders one named binding, collapsing identical names. */
function formatBinding(imported: string, local: string): string {
  return imported === local ? imported : `${imported} as ${local}`
}

/** Relative ESM specifier from one output chunk to another. */
function relativeSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to)
  return path.startsWith('.') ? path : `./${path}`
}
