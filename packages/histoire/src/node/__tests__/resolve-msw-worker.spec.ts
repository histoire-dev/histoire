import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveMswWorkerPath } from '../util/resolve-msw-worker.js'

describe('resolveMswWorkerPath', () => {
  const tempRoots: string[] = []

  function createTempRoot() {
    const root = mkdtempSync(join(tmpdir(), 'histoire-msw-'))
    tempRoots.push(root)
    return root
  }

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('prefers the msw package installed in the project', () => {
    const root = createTempRoot()
    const mswDir = join(root, 'node_modules/msw')
    mkdirSync(join(mswDir, 'lib'), { recursive: true })
    writeFileSync(join(mswDir, 'package.json'), JSON.stringify({
      name: 'msw',
      version: '0.0.0-project',
    }))
    writeFileSync(join(mswDir, 'lib/mockServiceWorker.js'), '// project worker')

    // The worker must come from the project's msw so its version matches the
    // msw runtime modules, which are also resolved project-first.
    expect(resolveMswWorkerPath(root)).toBe(join(mswDir, 'lib/mockServiceWorker.js'))
  })

  it('falls back to Histoire\'s own msw when the project has none', () => {
    const root = createTempRoot()

    const workerPath = resolveMswWorkerPath(root)

    expect(workerPath).toMatch(/mockServiceWorker\.js$/)
    expect(workerPath).not.toContain(root)
  })
})
