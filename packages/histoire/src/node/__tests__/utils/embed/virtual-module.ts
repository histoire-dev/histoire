import { transformSync } from 'esbuild'

/** Execute trusted generated ESM with explicit bindings and no browser/global mutation. */
export function evaluateVirtualModule<T>(source: string, define: Record<string, string>, bindings: Record<string, unknown>): T {
  const { code } = transformSync(source, { format: 'cjs', define })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func -- generated module behavior is under test
  new Function(...Object.keys(bindings), 'module', 'exports', code)(...Object.values(bindings), module, module.exports)
  return module.exports as T
}
