import type { Context } from '../context.js'
import { TEST_REGISTRY_KEY } from '@histoire/shared'
import { getStoryCollectTimeout } from '../util/test-timeouts.js'

export function browserCollector(ctx: Context, storyFiles = ctx.storyFiles.map(file => ({
  id: file.id,
  path: file.path,
  relativePath: file.relativePath,
  fileName: file.fileName,
  supportPluginId: file.supportPluginId,
  moduleId: file.moduleId,
  virtual: file.virtual,
}))) {
  const moduleLoaders = storyFiles
    .map(file => `${JSON.stringify(file.relativePath)}: () => import(${JSON.stringify(file.moduleId)})`)
    .join(',\n  ')

  return `
import { collectSupportPlugins } from 'virtual:$histoire-support-plugins-collect'

const storyFiles = ${JSON.stringify(storyFiles)}
const storyModuleLoaders = {
  ${moduleLoaders}
}
const TEST_REGISTRY_KEY = ${JSON.stringify(TEST_REGISTRY_KEY)}
const STORY_TIMEOUT = ${getStoryCollectTimeout(ctx)}
let preloadPromise

// Fails one story instead of the whole batch: every story module is executed in
// the same page, so a module that never settles (top-level await on a promise
// that never resolves, hanging import) would otherwise hold every other story
// hostage until the global collection timeout.
function withStoryTimeout(promise, action, relativePath) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(\`Timed out after \${STORY_TIMEOUT}ms while \${action} story "\${relativePath}". Increase \\\`test.storyCollectTimeout\\\` if the story is legitimately slow.\`)),
        STORY_TIMEOUT,
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

function cloneStoryFile(file) {
  return {
    ...file,
    treePath: undefined,
    treeFile: undefined,
    story: undefined,
    markdownFile: undefined,
    moduleCode: undefined,
  }
}

// Captures the \`onTest(...)\` calls performed while \`fn\` runs: the client's
// \`onTest\` pushes into the array installed under this global key (see
// \`pushHistoireTestRegistration\` in @histoire/shared). Registration happens at
// runtime at any call depth, so executing the story is the only reliable way
// to know whether it defines tests.
async function withTestRegistry(registrations, fn) {
  const previous = globalThis[TEST_REGISTRY_KEY]
  globalThis[TEST_REGISTRY_KEY] = registrations
  try {
    return await fn()
  }
  finally {
    globalThis[TEST_REGISTRY_KEY] = previous
  }
}

export async function collectStoryFile(relativePath) {
  const file = storyFiles.find(item => item.relativePath === relativePath)
  if (!file) {
    throw new Error(\`Unknown histoire story file "\${relativePath}"\`)
  }

  const loadStoryModule = storyModuleLoaders[relativePath]
  if (!loadStoryModule) {
    throw new Error(\`Missing histoire story module loader for "\${relativePath}"\`)
  }

  const registrations = []
  // Import the collected story BEFORE the shared preload: modules execute only
  // on their first import, so a module-scope \`onTest(...)\` would otherwise run
  // outside any registration window and be attributed to no file at all.
  await withTestRegistry(registrations, () => withStoryTimeout(loadStoryModule(), 'loading', relativePath))

  // Use allSettled so a single failing story module does not cascade to all other collections
  preloadPromise ??= Promise.allSettled(
    Object.entries(storyModuleLoaders).map(([path, load]) => withStoryTimeout(load(), 'preloading', path)),
  )
  await preloadPromise

  const payload = {
    file: cloneStoryFile(file),
    storyData: [],
    el: document.createElement('div'),
  }

  document.body.appendChild(payload.el)

  try {
    const loader = collectSupportPlugins[file.supportPluginId]
    if (!loader) {
      throw new Error(\`Unknown histoire support plugin "\${file.supportPluginId}"\`)
    }

    const { run } = await loader()
    // Mounting the story executes its setup, where most stories register tests.
    await withTestRegistry(registrations, () => withStoryTimeout(run(payload), 'mounting', relativePath))
  }
  finally {
    payload.el.remove()
  }

  return {
    file: relativePath,
    storyData: payload.storyData,
    hasTests: registrations.length > 0,
  }
}
`
}
