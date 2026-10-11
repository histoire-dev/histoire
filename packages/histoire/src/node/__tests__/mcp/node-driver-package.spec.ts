import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveBuildBrowserDriver } from '../../build/node/runtime-settings.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

/** Adds package metadata whose entry throws if build discovery evaluates it. */
async function writeBrowserDriver(root: string, packageName: string, version: string, manifestName = packageName): Promise<void> {
  const directory = join(root, 'node_modules', packageName)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: manifestName, version, main: 'index.js' }))
  await writeFile(join(directory, 'index.js'), 'throw new Error("browser driver must not be imported while packaging")')
}

describe('node artifact browser driver metadata', () => {
  it('pins project playwright-core without importing it or preferring Histoire fallback', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      await writeBrowserDriver(fixture.root, 'playwright-core', '1.60.2')
      expect(await resolveBuildBrowserDriver(fixture.root)).toEqual({ packageName: 'playwright-core', version: '1.60.2' })
    }
    finally { await fixture.close() }
  })

  it('selects project playwright before project core and pins only that driver identity', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      await writeBrowserDriver(fixture.root, 'playwright-core', '1.60.2')
      await writeBrowserDriver(fixture.root, 'playwright', '1.59.4')
      expect(await resolveBuildBrowserDriver(fixture.root)).toEqual({ packageName: 'playwright', version: '1.59.4' })
    }
    finally { await fixture.close() }
  })

  it('does not hide invalid preferred project playwright by selecting project core', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      await writeBrowserDriver(fixture.root, 'playwright-core', '1.60.2')
      await writeBrowserDriver(fixture.root, 'playwright', '1.59.4', 'unexpected-name')
      await expect(resolveBuildBrowserDriver(fixture.root)).rejects.toThrow('Selected browser driver package metadata is invalid: playwright')
    }
    finally { await fixture.close() }
  })
})
