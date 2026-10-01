import fs from 'node:fs'
import os from 'node:os'
import { transformSync } from 'esbuild'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeCollectionRun, applyCollectedStories, generateCollectionSpecFiles } from '../story-collection/index.js'

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

    const files = await generateCollectionSpecFiles(ctx, 'run-token', join(tempDir, 'collect'), [secondStory])

    expect(files).toHaveLength(1)
    expect(files[0].relativePath).toBe(secondStory.relativePath)
    expect(files[0].path).toContain('src__components__Second.story')
    expect(files[0].path).not.toContain('First.story')
    expect(fs.existsSync(files[0].path)).toBe(true)

    const specCode = fs.readFileSync(files[0].path, 'utf8')
    expect(specCode).toContain(`import { test } from '@vitest/runner'`)
    expect(specCode).not.toContain(`from 'vitest'`)
  })

  it('generates distinct temp paths for story paths that flatten identically', async () => {
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-collection-collision-'))
    tempDirs.push(tempDir)

    // Temp paths flatten separators, so 'src/a/b.story.vue' and
    // 'src/a__b.story.vue' produce the same segment: without a disambiguator
    // the second spec overwrites the first and its story is never collected.
    const nested = createStoryFile('src/a/b.story.vue')
    const flat = createStoryFile('src/a__b.story.vue')
    const ctx = createContext(tempDir, [nested, flat])

    const files = await generateCollectionSpecFiles(ctx, 'run-token', join(tempDir, 'collect'), [nested, flat])

    expect(files).toHaveLength(2)
    expect(new Set(files.map(file => file.path)).size).toBe(2)
    expect(files.every(file => fs.existsSync(file.path))).toBe(true)
  })

  it('escapes relative paths containing quotes, backticks and template markers', async () => {
    const tempDir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-collection-escape-'))
    tempDirs.push(tempDir)

    // POSIX paths allow single quotes, backticks and ${ — these used to break
    // out of the generated string/template literals and corrupt the spec module.
    // eslint-disable-next-line no-template-curly-in-string -- intentional adversarial path data
    const trickyPath = 'src/comp\'s/`weird`-${name}/Story.story.vue'
    const trickyStory = createStoryFile(trickyPath)
    const ctx = createContext(tempDir, [trickyStory])

    // eslint-disable-next-line no-template-curly-in-string -- intentional adversarial token data
    const files = await generateCollectionSpecFiles(ctx, 'run-`token`-${x}', join(tempDir, 'collect'), [trickyStory])
    const specCode = fs.readFileSync(files[0].path, 'utf8')

    // The raw value must appear only inside a JSON.stringify-escaped literal,
    // never as a bare interpolation that breaks the surrounding template.
    expect(specCode).toContain(JSON.stringify(trickyPath))
    // The path must not be embedded inside a backtick template literal, where
    // its own backtick/`${` would break out. Detect a breakout by parsing: an
    // unescaped path inside a template would corrupt the module syntax.
    expect(() => transformSync(specCode, { loader: 'ts', format: 'esm' })).not.toThrow()
  })
})

/**
 * Builds a minimal Context for applyCollectedStories. `tree.file: 'title'`
 * keeps finalizeCollectedStoryFile's path resolution trivial.
 */
function createApplyContext(storyFiles: any[]) {
  return {
    root: '/project',
    storyFiles,
    config: {
      tree: { file: 'title' },
    },
  } as any
}

describe('applyCollectedStories', () => {
  it('applies storyData[0] for a normal collection result', () => {
    const storyFile = {
      ...createStoryFile('src/components/Button.story.vue'),
      story: undefined,
    }
    const ctx = createApplyContext([storyFile])
    const results = new Map([
      [storyFile.relativePath, {
        file: storyFile.relativePath,
        storyData: [{ id: 'collected-id', title: 'Button' } as any],
      }],
    ])

    applyCollectedStories(ctx, results)

    expect(storyFile.story).toBeDefined()
    expect(storyFile.story.id).toBe('collected-id')
    expect(storyFile.id).toBe('collected-id')
  })

  it('reports whether the collected story registered tests', () => {
    const storyFile = {
      ...createStoryFile('src/components/Tested.story.vue'),
      story: undefined,
    }
    const ctx = createApplyContext([storyFile])
    const results = new Map([
      [storyFile.relativePath, {
        file: storyFile.relativePath,
        storyData: [{ id: 'tested', title: 'Tested' } as any],
        hasTests: true,
      }],
    ])

    const collected = applyCollectedStories(ctx, results)

    expect(collected).toHaveLength(1)
    expect(collected[0].hasTests).toBe(true)
    expect(collected[0].storyFile).toBe(storyFile)
  })

  it('returns detached copies without touching the live story files', () => {
    const originalStory = { id: 'original', title: 'Original' } as any
    const storyFile = {
      ...createStoryFile('src/components/Detached.story.vue'),
      id: 'original',
      story: originalStory,
    }
    const ctx = createApplyContext([storyFile])
    const results = new Map([
      [storyFile.relativePath, {
        file: storyFile.relativePath,
        storyData: [{ id: 'collected', title: 'Collected' } as any],
      }],
    ])

    // A dev-server test run overlaps the dev server's own collection of the
    // same objects: writing back would let stale browser data overwrite newer
    // node-collected data (and the app UI would never learn about it).
    const collected = applyCollectedStories(ctx, results, { applyToContext: false })

    expect(storyFile.story).toBe(originalStory)
    expect(storyFile.id).toBe('original')
    // The caller still gets the freshly collected data to work with.
    expect(collected).toHaveLength(1)
    expect(collected[0].storyFile).not.toBe(storyFile)
    expect(collected[0].storyFile.story?.id).toBe('collected')
    expect(collected[0].hasTests).toBe(false)
  })

  it('warns and leaves the original story untouched when no story was registered', () => {
    const originalStory = { id: 'original', title: 'Original' } as any
    const storyFile = {
      ...createStoryFile('src/components/Empty.story.vue'),
      story: originalStory,
    }
    const ctx = createApplyContext([storyFile])
    const results = new Map([
      [storyFile.relativePath, {
        file: storyFile.relativePath,
        storyData: [] as any[],
      }],
    ])

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Snapshot the messages while the spy is still active — mockRestore() clears
    // the call history, so capture before restoring.
    let messages: string[] = []
    try {
      applyCollectedStories(ctx, results)
      messages = warn.mock.calls.map(call => String(call[0]))
    }
    finally {
      warn.mockRestore()
    }

    // The empty result must NOT overwrite the existing story with undefined.
    expect(storyFile.story).toBe(originalStory)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('No story found')
    expect(messages[0]).toContain(storyFile.relativePath)
  })

  it('warns when multiple stories were registered but still uses the first', () => {
    const storyFile = {
      ...createStoryFile('src/components/Multi.story.vue'),
      story: undefined,
    }
    const ctx = createApplyContext([storyFile])
    const results = new Map([
      [storyFile.relativePath, {
        file: storyFile.relativePath,
        storyData: [
          { id: 'first', title: 'First' } as any,
          { id: 'second', title: 'Second' } as any,
        ],
      }],
    ])

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let messages: string[] = []
    try {
      applyCollectedStories(ctx, results)
      messages = warn.mock.calls.map(call => String(call[0]))
    }
    finally {
      warn.mockRestore()
    }

    expect(storyFile.story.id).toBe('first')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Multiple stories')
  })
})

/**
 * Builds the Vitest stub `analyzeCollectionRun` reads unhandled errors from.
 */
function createVitestStub(unhandledErrors: unknown[] = []) {
  return { state: { getUnhandledErrors: () => unhandledErrors } } as any
}

/**
 * Builds a Vitest test module stub for one generated collection spec.
 */
function createTestModule(options: {
  moduleId: string
  errors?: unknown[]
  failedTestErrors?: unknown[]
}) {
  return {
    moduleId: options.moduleId,
    errors: () => options.errors ?? [],
    children: {
      allTests: () => (options.failedTestErrors ?? []).map(error => ({
        result: () => ({ state: 'failed', errors: [error] }),
      })),
    },
  } as any
}

/**
 * Builds the collection channel payload of a run.
 */
function createPayload(options: {
  results?: string[]
  failures?: Record<string, string>
}) {
  return {
    results: new Map((options.results ?? []).map(file => [file, { file }])),
    failures: new Map(Object.entries(options.failures ?? {}).map(([file, error]) => [file, { error }])),
  }
}

describe('analyzeCollectionRun', () => {
  const okStory = createStoryFile('src/components/Ok.story.vue')
  const brokenStory = createStoryFile('src/components/Broken.story.vue')
  const specFiles = [
    { path: '/tmp/collect/ok/collect.histoire.spec.ts', relativePath: okStory.relativePath },
    { path: '/tmp/collect/broken/collect.histoire.spec.ts', relativePath: brokenStory.relativePath },
  ]

  it('attributes a reported story failure to that story only', () => {
    // The failing spec both POSTs the failure and rethrows it, so the same
    // error arrives twice — it must be reported once.
    const diagnostics = analyzeCollectionRun(
      [okStory, brokenStory] as any,
      createVitestStub(),
      [createTestModule({
        moduleId: specFiles[1].path,
        failedTestErrors: [new Error('story exploded')],
      })],
      createPayload({
        results: [okStory.relativePath],
        failures: { [brokenStory.relativePath]: 'Error: story exploded' },
      }),
      specFiles,
    )

    expect(diagnostics.fatalErrors).toEqual([])
    expect(diagnostics.storyFailures).toHaveLength(1)
    expect(diagnostics.storyFailures[0].relativePath).toBe(brokenStory.relativePath)
    expect(diagnostics.storyFailures[0].error).toContain('story exploded')
  })

  it('attributes a missing result to its story', () => {
    const diagnostics = analyzeCollectionRun(
      [okStory, brokenStory] as any,
      createVitestStub(),
      [],
      createPayload({ results: [okStory.relativePath] }),
      specFiles,
    )

    expect(diagnostics.fatalErrors).toEqual([])
    expect(diagnostics.storyFailures.map(failure => failure.relativePath)).toEqual([brokenStory.relativePath])
  })

  it('keeps unattributable errors fatal', () => {
    // An unhandled page error, or an error in the shared collector module, took
    // every story down: warning per story would bury the real cause.
    const diagnostics = analyzeCollectionRun(
      [okStory, brokenStory] as any,
      createVitestStub([new Error('page crashed')]),
      [createTestModule({
        moduleId: '/tmp/collect/unknown.spec.ts',
        errors: [new Error('collector module failed to load')],
      })],
      createPayload({ results: [okStory.relativePath, brokenStory.relativePath] }),
      specFiles,
    )

    expect(diagnostics.storyFailures).toEqual([])
    expect(diagnostics.fatalErrors.join('\n')).toContain('page crashed')
    expect(diagnostics.fatalErrors.join('\n')).toContain('collector module failed to load')
  })

  it('treats a run that collected nothing as a fatal infrastructure failure', () => {
    // No result at all means the browser run itself never worked; degrading it
    // to N per-story warnings would hide that behind story noise.
    const diagnostics = analyzeCollectionRun(
      [okStory, brokenStory] as any,
      createVitestStub(),
      [],
      createPayload({}),
      specFiles,
    )

    expect(diagnostics.storyFailures).toEqual([])
    expect(diagnostics.fatalErrors).toHaveLength(2)
    expect(diagnostics.fatalErrors.join('\n')).toContain(okStory.relativePath)
  })
})
