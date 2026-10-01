import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { transformSync } from 'esbuild'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { browserCollector } from '../virtual/browser-collector.js'

const tempDirs: string[] = []

afterEach(() => {
  delete (globalThis as any).document

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Builds a minimal story file descriptor for the browser collector generator.
 */
function createStoryFile(relativePath: string) {
  return {
    id: relativePath,
    path: `/virtual/${relativePath}`,
    relativePath,
    fileName: relativePath.split('/').pop() ?? relativePath,
    supportPluginId: 'vue3',
    moduleId: `/virtual/${relativePath}`,
    virtual: false,
  }
}

/** Mirrors what `onTest()` does through `pushHistoireTestRegistration`. */
const REGISTER_TEST_SOURCE = `
const registry = globalThis.__HST_TEST_REGISTRY__
if (Array.isArray(registry)) {
  registry.push(() => {})
}
`

/**
 * Writes and imports the generated collector module in its own temp directory,
 * mirroring the real runtime where each story file is collected in a fresh
 * browser page (and therefore a fresh module graph).
 * @param options Collection setup.
 * @param options.stories Story modules available to the collector.
 * @param options.target Relative path of the story to collect.
 * @param options.registerDuringMount Registers a test while the support plugin
 * mounts the story, i.e. from the story's `setup` instead of its module scope.
 * @param options.storyCollectTimeout Per-story timeout (ms) baked into the
 * generated collector.
 */
async function collectInFreshModuleGraph(options: {
  stories: Array<{ relativePath: string, source: string }>
  target: string
  registerDuringMount?: boolean
  storyCollectTimeout?: number
}) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'histoire-browser-collector-'))
  tempDirs.push(dir)

  const storyFiles = options.stories.map((story) => {
    const modulePath = join(dir, `${story.relativePath.replace(/[\\/]/g, '__')}.mjs`)
    fs.writeFileSync(modulePath, story.source, 'utf8')
    return {
      ...createStoryFile(story.relativePath),
      moduleId: pathToFileURL(modulePath).href,
    }
  })

  const runPath = join(dir, 'support-plugin.mjs')
  fs.writeFileSync(runPath, `
export async function run({ storyData }) {
  ${options.registerDuringMount ? REGISTER_TEST_SOURCE : ''}
  storyData.push({ id: 'collected', title: 'Collected', variants: [] })
}
`, 'utf8')

  const supportPluginsPath = join(dir, 'support-plugins.mjs')
  fs.writeFileSync(supportPluginsPath, `export const collectSupportPlugins = { vue3: () => import(${JSON.stringify(pathToFileURL(runPath).href)}) }`, 'utf8')

  const ctx = { config: { test: { storyCollectTimeout: options.storyCollectTimeout } } }
  const collectorPath = join(dir, 'collector.mjs')
  fs.writeFileSync(
    collectorPath,
    browserCollector(ctx as any, storyFiles).replace(`'virtual:$histoire-support-plugins-collect'`, JSON.stringify(pathToFileURL(supportPluginsPath).href)),
    'utf8',
  )

  // The collector mounts stories into a DOM host element.
  ;(globalThis as any).document = {
    createElement: () => ({ remove() {} }),
    body: { appendChild() {} },
  }

  const { collectStoryFile } = await import(pathToFileURL(collectorPath).href)
  return await collectStoryFile(options.target)
}

describe('browserCollector', () => {
  it('escapes relative paths used as loader keys', () => {
    // POSIX paths legally contain single quotes, backticks and ${ — an
    // unescaped key would break the generated storyModuleLoaders object.
    // eslint-disable-next-line no-template-curly-in-string -- intentional adversarial path data
    const trickyPath = 'src/comp\'s/`weird`-${name}/Story.story.vue'
    const code = browserCollector({} as any, [createStoryFile(trickyPath)])

    // The loader key must be a JSON.stringify-escaped literal.
    expect(code).toContain(`${JSON.stringify(trickyPath)}: () => import(`)
    // The previous unescaped single-quote key form must not be present.
    expect(code).not.toContain(`'${trickyPath}':`)
    // The generated module must stay syntactically valid.
    expect(() => transformSync(code, { loader: 'ts', format: 'esm' })).not.toThrow()
  })

  it('reports tests registered at the story module scope', async () => {
    // Module scope only executes on the first import, so the target module has
    // to be imported inside the registration window — before the shared
    // preload warms every other story module.
    const result = await collectInFreshModuleGraph({
      stories: [
        { relativePath: 'src/Tested.story.vue', source: `${REGISTER_TEST_SOURCE}\nexport default {}` },
        { relativePath: 'src/Other.story.vue', source: 'export default {}' },
      ],
      target: 'src/Tested.story.vue',
    })

    expect(result.hasTests).toBe(true)
    expect(result.storyData).toHaveLength(1)
  })

  it('reports tests registered while the story is mounted', async () => {
    const result = await collectInFreshModuleGraph({
      stories: [{ relativePath: 'src/Setup.story.vue', source: 'export default {}' }],
      target: 'src/Setup.story.vue',
      registerDuringMount: true,
    })

    expect(result.hasTests).toBe(true)
  })

  it('reports no tests for stories that register none', async () => {
    const result = await collectInFreshModuleGraph({
      stories: [{ relativePath: 'src/Plain.story.vue', source: 'export default {}' }],
      target: 'src/Plain.story.vue',
    })

    expect(result.hasTests).toBe(false)
  })

  it('collects a healthy story even when another story module never settles', async () => {
    // The collector preloads every story module in the same page, so without a
    // per-story timeout this hangs until the whole-batch collection timeout and
    // every story fails instead of only the broken one.
    const result = await collectInFreshModuleGraph({
      stories: [
        { relativePath: 'src/Hanging.story.vue', source: 'await new Promise(() => {})\nexport default {}' },
        { relativePath: 'src/Healthy.story.vue', source: 'export default {}' },
      ],
      target: 'src/Healthy.story.vue',
      storyCollectTimeout: 200,
    })

    expect(result.storyData).toHaveLength(1)
  })

  it('fails the hanging story itself with a per-story timeout error', async () => {
    await expect(collectInFreshModuleGraph({
      stories: [{ relativePath: 'src/Hanging.story.vue', source: 'await new Promise(() => {})\nexport default {}' }],
      target: 'src/Hanging.story.vue',
      storyCollectTimeout: 200,
    })).rejects.toThrow(/Timed out after 200ms.*src\/Hanging\.story\.vue/)
  })

  it('does not attribute another story\'s registrations to the collected file', async () => {
    const result = await collectInFreshModuleGraph({
      stories: [
        { relativePath: 'src/Plain.story.vue', source: 'export default {}' },
        { relativePath: 'src/Tested.story.vue', source: `${REGISTER_TEST_SOURCE}\nexport default {}` },
      ],
      target: 'src/Plain.story.vue',
    })

    expect(result.hasTests).toBe(false)
  })
})
