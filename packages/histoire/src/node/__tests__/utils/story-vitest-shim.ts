import { collectHistoireTests } from '@histoire/shared'
import { transform } from 'esbuild'
import { runSessionTests } from '../../virtual/variant-test-session/run.js'
import { resolveBrowserRuntimePaths } from '../../vite/resolve-paths.js'
import { createStoryVitestShimPlugin } from '../../vite/story-vitest-shim.js'
import { createSessionOptions, STORY_ID, VARIANT_ID } from './variant-test-session.js'

/** Evaluates the emitted facade against installed Vitest packages, without loading a browser. */
export async function loadStoryVitestShim() {
  const context = { root: process.cwd(), storyFiles: [] } as any
  const plugin = createStoryVitestShimPlugin(context, resolveBrowserRuntimePaths(context, true))
  const id = await (plugin.resolveId as any)('vitest', `${context.root}/Example.story.vue`)
  const source = await (plugin.load as any)(id) as string
  const dependencies = new Map<string, unknown>()
  for (const [, path] of source.matchAll(/^import .* from "([^"]+)"/gm)) {
    dependencies.set(path, await import(/* @vite-ignore */ path))
  }
  const { code } = await transform(source, { format: 'cjs' })
  const module = { exports: {} as any }
  const key = Symbol.for('expect-global')
  const previous = (globalThis as any)[key]
  try {
    delete (globalThis as any)[key]
    // eslint-disable-next-line no-new-func -- execute the generated facade with real, preloaded dependencies
    new Function('require', 'module', 'exports', code)(
      (path: string) => dependencies.get(path),
      module,
      module.exports,
    )
  }
  finally {
    ;(globalThis as any)[key] = previous
  }
  return module.exports
}

/** Runs declarations made through the emitted facade with preview task bookkeeping. */
export async function runStoryVitestTests(register: (shim: any) => void) {
  const shim = await loadStoryVitestShim()
  const key = Symbol.for('expect-global')
  const previous = (globalThis as any)[key]
  const file = createSessionOptions().files[0] as any
  try {
    ;(globalThis as any)[key] = shim.expect
    return await runSessionTests({
      file,
      definitions: collectHistoireTests([() => register(shim)], {} as any),
      cleanup() {},
    }, STORY_ID, VARIANT_ID)
  }
  finally {
    ;(globalThis as any)[key] = previous
  }
}
