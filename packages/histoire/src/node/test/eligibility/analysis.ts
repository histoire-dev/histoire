import { parseAst } from 'rollup/dist/parseAst.js'

/** Resolved dependency edges and conservative registration capability of one module. */
export interface CollectionModuleAnalysis {
  /** Static and literal dynamic imports requiring inspection. */
  imports: string[]
  /** True only when this module contains no registration or opaque execution. */
  safe: boolean
  /** Named reads of owned Histoire client plumbing, verified against resolved runtime identity. */
  runtimeImports?: string[]
}

const registrationNames = new Set(['onTest', 'pushHistoireTestRegistration', 'TEST_REGISTRY_KEY', 'TEST_DEFINITIONS_KEY'])
const opaqueNames = new Set(['eval', 'Function', 'require', 'importScripts', 'WebAssembly'])
const registryKeys = new Set(['__HST_TEST_REGISTRY__', '__HST_TEST_DEFINITIONS__', '__HST_ACTIVE_TEST_COLLECTOR__'])
const globals = new Set(['window', 'globalThis', 'self', 'global'])

/** Inspect transformed JavaScript before admitting a test-free shortcut. */
export function analyzeCollectionModule(code: string): CollectionModuleAnalysis {
  const imports = new Set<string>()
  const globalAliases = new Set(globals)
  const bindings: AstNode[] = []
  const runtimeImports = new Map<string, boolean>()
  let safe = true
  /** Resolve global aliases independent of declaration order, including returned browser globals. */
  function globalValue(node?: AstNode): boolean {
    if (!node) return false
    if (node.type === 'Identifier') return globalAliases.has(node.name!)
    if (node.type === 'CallExpression') return globalValue(node.callee)
    if (node.type === 'MemberExpression') return globalValue(node.object) || node.property?.name === 'defaultView'
    if (node.type === 'ArrowFunctionExpression') return globalValue(node.body)
    return false
  }
  /** Shared structural walk handles parser-owned nodes without string matching. */
  function children(node: AstNode): AstNode[] {
    return Object.values(node).flatMap(value => (Array.isArray(value) ? value : [value]).filter(child => child && typeof child === 'object' && typeof child.type === 'string'))
  }
  /** Alias capture precedes capability inspection so closures cannot hide later declarations. */
  function bind(node: AstNode) {
    if (node.type === 'VariableDeclarator') bindings.push(node)
    for (const child of children(node)) bind(child)
  }
  /** Every executable branch is inspected, including branches not taken during metadata collection. */
  function visit(node: AstNode) {
    if (node.type === 'Identifier' && (registrationNames.has(node.name!) || registryKeys.has(node.name!) || opaqueNames.has(node.name!))) safe = false
    if (node.type === 'Literal' && registryKeys.has(String(node.value))) safe = false
    if (node.type === 'MemberExpression') {
      const property = node.property?.name ?? node.property?.value
      if (node.computed && globalValue(node.object) && node.property?.type !== 'Literal') safe = false
      if (typeof property === 'string' && opaqueNames.has(property)) safe = false
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const property = node.callee?.property?.name ?? node.callee?.property?.value
      const called = node.callee?.name ?? property
      if (property === 'constructor') safe = false
      if (node.callee?.object?.name === 'Reflect' && node.arguments?.some(argument => globalAliases.has(argument.name!))) safe = false
      if (property === 'createElement' && (node.arguments?.[0]?.type !== 'Literal' || String(node.arguments[0].value).toLowerCase() === 'script')) safe = false
      if (['setTimeout', 'setInterval'].includes(String(called)) && !['FunctionExpression', 'ArrowFunctionExpression'].includes(node.arguments?.[0]?.type ?? '')) safe = false
      if ((globalValue(node.callee?.object) || node.callee?.object?.name === 'document') && ['write', 'writeln'].includes(String(property))) safe = false
    }
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) {
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        imports.add(node.source.value)
        if (node.source.value === 'histoire/client') {
          const trusted = node.type === 'ImportDeclaration' && !!node.specifiers?.length && node.specifiers.every(specifier => specifier.type === 'ImportSpecifier' && ['logEvent', 'isCollecting'].includes(String(specifier.imported?.name)))
          runtimeImports.set(node.source.value, trusted && runtimeImports.get(node.source.value) !== false)
        }
      }
      else {
        safe = false
      }
    }
    for (const child of children(node)) visit(child)
  }
  try {
    const ast = parseAst(code) as unknown as AstNode
    bind(ast)
    let changed = true
    while (changed) {
      const size = globalAliases.size
      for (const node of bindings) {
        if (node.id?.name && globalValue(node.init)) globalAliases.add(node.id.name)
      }
      changed = globalAliases.size !== size
    }
    visit(ast)
  }
  catch { safe = false }
  const plumbing = [...runtimeImports].filter(([, trusted]) => trusted).map(([id]) => id)
  return { imports: [...imports], safe, ...(plumbing.length ? { runtimeImports: plumbing } : {}) }
}

/** Minimal structural AST view; parser owns concrete node types. */
interface AstNode {
  /** ESTree discriminant. */
  type: string
  /** Identifier spelling. */
  name?: string
  /** Literal value. */
  value?: unknown
  /** Import source or expression. */
  source?: AstNode
  /** Computed property access. */
  computed?: boolean
  /** Property access expression. */
  object?: AstNode
  /** Property key. */
  property?: AstNode
  /** Assignment binding and initializer. */
  id?: AstNode
  init?: AstNode
  /** Call or construction target and its operands. */
  callee?: AstNode
  arguments?: AstNode[]
  /** Expression body of a global accessor. */
  body?: AstNode
  /** Named import bindings. */
  specifiers?: AstNode[]
  imported?: AstNode
  [key: string]: unknown
}
