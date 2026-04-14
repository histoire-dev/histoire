import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { generateCollectionSpecFiles } from '../story-collection.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Creates minimal browser collection context for spec generation tests.
 */
function createContext(root: string, storyFiles: any[]) {
  return {
    root,
    storyFiles,
    supportPlugins: [],
  } as any
}

/**
 * Creates minimal story file stub for collection spec generation tests.
 */
function createStoryFile(relativePath: string) {
  return {
    id: relativePath,
    path: join('/virtual', relativePath),
    relativePath,
    fileName: relativePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? relativePath,
    supportPluginId: 'vue3',
    moduleId: `/virtual/${relativePath}`,
    virtual: false,
  }
}

describe('generateCollectionSpecFiles', () => {
  it('creates browser collection specs only for provided story subset', async () => {
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-collection-specs-'))
    tempDirs.push(tempDir)

    const firstStory = createStoryFile('src/components/First.story.vue')
    const secondStory = createStoryFile('src/components/Second.story.vue')
    const ctx = createContext(tempDir, [firstStory, secondStory])

    const files = await generateCollectionSpecFiles(ctx, 'run-token', [secondStory])

    expect(files).toHaveLength(1)
    expect(files[0]).toContain('src__components__Second.story')
    expect(files[0]).not.toContain('First.story')
    expect(fs.existsSync(files[0])).toBe(true)
  })
})
