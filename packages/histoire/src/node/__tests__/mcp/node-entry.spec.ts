import { symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isDirectNodeEntry } from '../../deploy/entry.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('direct deployed entry identity', () => {
  it('recognizes symlinked release script while imported/unrelated entry stays inert', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      const script = join(fixture.root, 'server.mjs')
      const release = join(fixture.root, 'current.mjs')
      await writeFile(script, 'export const fixture = true')
      await symlink(script, release)
      expect(isDirectNodeEntry(pathToFileURL(script).href, release)).toBe(true)
      expect(isDirectNodeEntry(pathToFileURL(script).href, script)).toBe(true)
      expect(isDirectNodeEntry(pathToFileURL(script).href, join(fixture.root, 'other.mjs'))).toBe(false)
      expect(isDirectNodeEntry(pathToFileURL(script).href, '')).toBe(false)
    }
    finally { await fixture.close() }
  })
})
