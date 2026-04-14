import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { fileHasOnTestCall } from '../util/story-vitest.js'

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

describe('fileHasOnTestCall', () => {
  it('matches direct onTest calls in virtual story sources', () => {
    expect(fileHasOnTestCall(createStoryFile(`
      import { onTest } from 'histoire/client'

      onTest(() => {})
    `))).toBe(true)
  })

  it('does not match stories without onTest calls', () => {
    expect(fileHasOnTestCall(createStoryFile(`
      export default {
        title: 'Plain story',
      }
    `))).toBe(false)
  })

  it('does not match imports, comments, or strings without direct calls', () => {
    expect(fileHasOnTestCall(createStoryFile(`
      import { onTest } from 'histoire/client'

      const message = "onTest(() => {})"
      const template = \`onTest(() => {})\`

      // onTest(() => {})
      /* onTest(() => {}) */
    `))).toBe(false)
  })

  it('reads disk-backed story files when moduleCode missing', () => {
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-story-vitest-'))
    tempDirs.push(tempDir)
    const filePath = join(tempDir, 'DiskBacked.story.ts')
    fs.writeFileSync(filePath, `
      import { onTest } from 'histoire/client'

      onTest(() => {})
    `, 'utf8')

    expect(fileHasOnTestCall({
      path: filePath,
      relativePath: 'DiskBacked.story.ts',
      virtual: false,
    } as any)).toBe(true)
  })
})
