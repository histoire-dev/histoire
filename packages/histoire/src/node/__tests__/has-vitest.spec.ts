import fs from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasProjectVitest } from '../util/has-vitest.js'

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Creates a temp project root with the given package.json contents.
 */
function createProjectRoot(packageJson: Record<string, unknown>) {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'histoire-has-vitest-'))
  tempDirs.push(root)
  fs.writeFileSync(join(root, 'package.json'), JSON.stringify(packageJson), 'utf8')
  return root
}

/**
 * Package-manifest contract, not a source grep: the assertion below is about
 * what this package DECLARES to the installer, which is only observable by
 * reading `package.json`.
 */
describe('vitest peer contract', () => {
  it('declares vitest and the browser provider as optional peers with a supported range', () => {
    // Histoire imports `vitest/node` at runtime and patches `@internal` Vitest
    // APIs (see vitest-browser-config/browser-project.ts). Without a peer
    // declaration, the
    // version actually loaded is unconstrained and strict install layouts
    // (pnpm hoist=false, Yarn PnP) cannot resolve it from histoire at all.
    const packageJson = JSON.parse(fs.readFileSync(join(process.cwd(), 'package.json'), 'utf8'))

    expect(packageJson.peerDependencies?.vitest).toBeTruthy()
    expect(packageJson.peerDependencies?.['@vitest/browser-playwright']).toBeTruthy()
    expect(packageJson.peerDependenciesMeta?.vitest?.optional).toBe(true)
    expect(packageJson.peerDependenciesMeta?.['@vitest/browser-playwright']?.optional).toBe(true)
  })
})

/**
 * Installs a minimal `vitest` package under `directory/node_modules`.
 */
function installVitest(directory: string) {
  const packageRoot = join(directory, 'node_modules', 'vitest')
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'vitest', version: '5.0.0', exports: { '.': './index.js', './node': './node.js' } }), 'utf8')
  fs.writeFileSync(join(packageRoot, 'index.js'), '', 'utf8')
  fs.writeFileSync(join(packageRoot, 'node.js'), '', 'utf8')
}

describe('hasProjectVitest', () => {
  const nodePath = process.env.NODE_PATH

  afterEach(() => {
    if (nodePath === undefined) delete process.env.NODE_PATH
    else process.env.NODE_PATH = nodePath
    ;(Module as unknown as { _initPaths: () => void })._initPaths()
  })

  it('returns false when vitest is declared but not installed', () => {
    const root = createProjectRoot({ devDependencies: { vitest: '^5.0.0' } })

    expect(hasProjectVitest(root)).toBe(false)
  })

  it('returns true when the project installs vitest', () => {
    const root = createProjectRoot({ devDependencies: { vitest: '^5.0.0' } })
    installVitest(root)

    expect(hasProjectVitest(root)).toBe(true)
  })

  it('returns true in hoisted workspaces where vitest is resolvable but not declared in package.json', () => {
    const workspace = createProjectRoot({ private: true })
    installVitest(workspace)
    const root = join(workspace, 'packages', 'app')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { foo: '^1.0.0' } }), 'utf8')

    expect(hasProjectVitest(root)).toBe(true)
  })

  it('returns false when vitest is only reachable through NODE_PATH', () => {
    // pnpm bin shims export a NODE_PATH holding Histoire's own dependencies.
    const store = createProjectRoot({ private: true })
    installVitest(store)
    process.env.NODE_PATH = join(store, 'node_modules')
    ;(Module as unknown as { _initPaths: () => void })._initPaths()
    const root = createProjectRoot({ devDependencies: { foo: '^1.0.0' } })

    expect(hasProjectVitest(root)).toBe(false)
  })
})
