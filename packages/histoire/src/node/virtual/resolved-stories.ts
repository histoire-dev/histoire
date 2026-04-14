import type { Context } from '../context.js'
import { makeTree } from '../tree.js'
import { fileHasVitestMocks } from '../util/story-vitest.js'

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
  return `function ensureVitestRunner() {
  const runner = globalThis.__vitest_browser_runner__ ?? {}
  if (typeof runner.wrapDynamicImport !== 'function') {
    runner.wrapDynamicImport = loader => loader()
  }
  globalThis.__vitest_browser_runner__ = runner
  return runner
}

function runWithVitestDynamicImport(loader) {
  return ensureVitestRunner().wrapDynamicImport(loader)
}

export let files = [${files.map(file => `{${JSON.stringify(file).slice(1, -1)}, component: () => runWithVitestDynamicImport(() => import(${JSON.stringify(file.moduleId)})).then(m => m.default ?? m), source: () => runWithVitestDynamicImport(() => import('virtual:story-source:${file.story.id}'))}`).join(',\n')}]
export let tree = ${JSON.stringify(makeTree(ctx.config, resolvedStories))}
const handlers = []
export function onUpdate (cb) {
  handlers.push(cb)
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    files = newModule.files
    tree = newModule.tree
    handlers.forEach(h => {
      h(newModule.files, newModule.tree)
      newModule.onUpdate(h)
    })
  })
}`
}
