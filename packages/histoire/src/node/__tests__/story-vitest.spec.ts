import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { fileHasVitestMocks } from '../util/story-vitest.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Creates minimal story file stub for source detection tests.
 */
function createStoryFile(source: string) {
  return {
    path: '',
    relativePath: '',
    moduleCode: source,
    virtual: true,
  } as any
}

describe('fileHasVitestMocks', () => {
  it('matches vitest mock calls in virtual story sources', () => {
    expect(fileHasVitestMocks(createStoryFile(`
      import { vi } from 'vitest'

      vi.mock('./greeting')
    `))).toBe(true)
  })

  it('does not match stories without mock calls', () => {
    expect(fileHasVitestMocks(createStoryFile(`
      export default {
        title: 'Plain story',
      }
    `))).toBe(false)
  })

  it('does not match imports, comments, or strings without direct calls', () => {
    expect(fileHasVitestMocks(createStoryFile(`
      import { vi } from 'vitest'

      const message = "vi.mock('./greeting')"
      const template = \`vi.mock('./greeting')\`

      // vi.mock('./greeting')
      /* vi.mock('./greeting') */
    `))).toBe(false)
  })

  it('reads disk-backed story files when moduleCode missing', () => {
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-story-vitest-'))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, 'DiskBacked.story.ts')
    fs.writeFileSync(filePath, `
      import { vi } from 'vitest'

      vi.mock('./greeting')
    `, 'utf8')

    expect(fileHasVitestMocks({
      path: filePath,
      relativePath: 'DiskBacked.story.ts',
      virtual: false,
    } as any)).toBe(true)
  })
})
