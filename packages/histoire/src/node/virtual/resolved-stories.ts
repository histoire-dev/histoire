import type { Context } from '../context.js'
import { makeTree } from '../tree.js'
import { fileHasVitestMocks } from '../util/story-vitest.js'
import { STORY_SOURCE_ID_PREFIX } from './story-source.js'
import { VITEST_DYNAMIC_IMPORT_SNIPPET } from './vitest-runner-bootstrap.js'

/** Generates lazy story metadata and lifetime-owned subscriptions across HMR. */
export function resolvedStories(ctx: Context) {
  const resolvedStories = ctx.storyFiles.filter(s => !!s.story)
  const files = resolvedStories.map((file, index) => {
    return {
      id: file.id,
      path: file.treePath,
      filePath: file.relativePath,
      story: file.story,
      supportPluginId: file.supportPluginId,
      docsFilePath: file.markdownFile?.relativePath,
      hasVitestMocks: fileHasVitestMocks(file),
      index,
      moduleId: file.moduleId,
    }
  })
  return `${VITEST_DYNAMIC_IMPORT_SNIPPET}

export let files = [${files.map(file => `{${JSON.stringify(file).slice(1, -1)}, component: { __asyncLoader: () => runWithVitestDynamicImport(() => import(${JSON.stringify(file.moduleId)})).then(m => m.default ?? m) }, source: () => runWithVitestDynamicImport(() => import(${JSON.stringify(`${STORY_SOURCE_ID_PREFIX}${file.story.id}`)}))}`).join(',\n')}]
export let tree = ${JSON.stringify(makeTree(ctx.config, resolvedStories))}
// Vite retains this Set across module replacement; original disposers still own it.
const handlers = import.meta.hot
  ? (import.meta.hot.data.histoireStoryHandlers ??= new Set())
  : new Set()
export function onUpdate (cb) {
  handlers.add(cb)
  return () => handlers.delete(cb)
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (!newModule) return
    files = newModule.files
    tree = newModule.tree
    for (const handler of [...handlers]) {
      if (handlers.has(handler)) handler(files, tree)
    }
  })
}`
}
