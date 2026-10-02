import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { join } from 'pathe'
import { createSourceFile, forEachChild, isAwaitExpression, isCallExpression, isStringLiteralLike, ScriptTarget, SyntaxKind } from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importResolvedModule } from '../util/import-resolved.js'
import { listNodeSourceFiles, readNodeSource, readNodeSources } from './utils/node-source.js'

const require = createRequire(import.meta.url)

/** Inspect executable imports, excluding source strings used by child-process proofs. */
function hasRawAwaitedImport(file: string): boolean {
  const source = createSourceFile(file, readNodeSource(file), ScriptTarget.Latest, true)
  let found = false
  /** Match the existing awaited-import guard without parsing quoted code as execution. */
  function visit(node: import('typescript').Node) {
    if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword
      && isAwaitExpression(node.parent) && !isStringLiteralLike(node.arguments[0])
      && !node.getFullText(source).includes('@vite-ignore')) {
      found = true
    }
    forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('importResolvedModule', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.doUnmock('../util/resolve-vitest-package.js')
    vi.resetModules()

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('imports a module from a require.resolve-style absolute path', async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-import-'))
    tempDirs.push(dir)
    const filePath = join(dir, 'module.mjs')
    fs.writeFileSync(filePath, 'export const value = 42\n')

    const mod = await importResolvedModule<{ value: number }>(filePath)

    expect(mod.value).toBe(42)
  })

  it('imports a real resolved package path', async () => {
    const resolved = require.resolve('pathe')

    const mod = await importResolvedModule(resolved)

    expect(mod).toBeTruthy()
  })

  it('is used for every dynamic import of a resolver result in the node code', () => {
    // `await import(<absolute path>)` crashes on Windows — a resolver result
    // must always go through importResolvedModule (pathToFileURL). Only
    // explicitly bundler-handled imports (`@vite-ignore`, resolved by Vite in
    // the browser, never by Node's ESM loader) may take a raw value.
    const offenders = listNodeSourceFiles().filter(hasRawAwaitedImport)

    expect(offenders).toEqual([])

    // The two node-side call sites that do import a resolver result.
    expect(readNodeSource('vite/mocker.ts')).toContain('importResolvedModule')
    expect(readNodeSources('vitest-browser-config')).toContain('importResolvedModule')
  })

  it('degrades gracefully when @vitest/mocker is unresolvable', async () => {
    // The mocker probe runs at dev/build server startup for every vitest
    // project; a project whose vitest lacks @vitest/mocker (older versions,
    // strict layouts) must get a warning + disabled mocking, not a crash.
    vi.resetModules()
    vi.doMock('../util/resolve-vitest-package.js', () => ({
      resolveVitestModule: () => {
        throw new Error('unresolvable')
      },
      tryResolveVitestModule: () => null,
    }))
    const { createMockerPlugins } = await import('../vite/mocker.js')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const plugins = await createMockerPlugins({ root: '/project', mode: 'dev' } as any)

    expect(plugins).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('@vitest/mocker'))
  })
})
