import type { Context } from '../context.js'

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
    .map(file => `'${file.relativePath}': () => import(${JSON.stringify(file.moduleId)})`)
    .join(',\n  ')

  return `
import { collectSupportPlugins } from 'virtual:$histoire-support-plugins-collect'

const storyFiles = ${JSON.stringify(storyFiles)}
const storyModuleLoaders = {
  ${moduleLoaders}
}
let preloadPromise

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

export async function collectStoryFile(relativePath) {
  // Use allSettled so a single failing story module does not cascade to all other collections
  preloadPromise ??= Promise.allSettled(Object.values(storyModuleLoaders).map(load => load()))
  await preloadPromise

  const file = storyFiles.find(item => item.relativePath === relativePath)
  if (!file) {
    throw new Error(\`Unknown histoire story file "\${relativePath}"\`)
  }

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

    const loadStoryModule = storyModuleLoaders[relativePath]
    if (!loadStoryModule) {
      throw new Error(\`Missing histoire story module loader for "\${relativePath}"\`)
    }

    await loadStoryModule()

    const { run } = await loader()
    await run(payload)
  }
  finally {
    payload.el.remove()
  }

  return {
    file: relativePath,
    storyData: payload.storyData,
  }
}
`
}
