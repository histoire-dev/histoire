import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('hasProjectVitest', () => {
  let hasProjectVitest: typeof import('../util/has-vitest.js').hasProjectVitest

  beforeEach(async () => {
    vi.resetModules()
  })

  it('returns true when vitest is listed in package.json dependencies', async () => {
    ;({ hasProjectVitest } = await import('../util/has-vitest.js'))
    const root = createProjectRoot({ devDependencies: { vitest: '^4.0.0' } })

    expect(hasProjectVitest(root)).toBe(true)
  })

  it('returns true in hoisted workspaces where vitest is resolvable but not declared in package.json', async () => {
    // Simulate a hoisted/monorepo install: the project package.json does NOT
    // list vitest, but `vitest/node` resolves from the project root because it
    // is hoisted to the workspace root.
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => ({
          resolve: vi.fn((id: string) => {
            if (id === 'vitest/node' || id === 'vitest') {
              return '/workspace/node_modules/vitest/dist/node.js'
            }
            throw new Error(`Cannot find module '${id}'`)
          }),
        })),
      }
    })
    ;({ hasProjectVitest } = await import('../util/has-vitest.js'))
    const root = createProjectRoot({ devDependencies: { foo: '^1.0.0' } })

    expect(hasProjectVitest(root)).toBe(true)
  })

  it('returns false when vitest is neither declared nor resolvable', async () => {
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => ({
          resolve: vi.fn((id: string) => {
            throw new Error(`Cannot find module '${id}'`)
          }),
        })),
      }
    })
    ;({ hasProjectVitest } = await import('../util/has-vitest.js'))
    const root = createProjectRoot({ devDependencies: { foo: '^1.0.0' } })

    expect(hasProjectVitest(root)).toBe(false)
  })
})
