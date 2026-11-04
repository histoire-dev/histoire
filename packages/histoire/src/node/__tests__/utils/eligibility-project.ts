import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { attachTestCollectionEligibility } from '../../test/eligibility/index.js'
import { collectionEligibilityTransformPlugin } from '../../test/eligibility/transforms.js'
import { GENERATED_GLOBAL_SETUP, RESOLVED_GENERATED_GLOBAL_SETUP, SETUP_ID } from '../../virtual/index.js'

/** Initial bytes of the plugin-owned virtual leaf, like a Nuxt `#build` template. */
export const DEFAULT_VIRTUAL_DATA = 'export const preference = "system"'

/** Inputs of one real-Vite eligibility project. */
export interface EligibilityProjectOptions {
  /** Extra files by project-relative path, written next to the common setup/installed/unrelated files. */
  files?: Record<string, string>
  /** Story IDs; each owns `<id>.story.js` (supplied by `files`) with one `main` variant. */
  stories: string[]
}

/**
 * Real Vite resolution/transforms over stories sharing a setup graph that,
 * like Nuxt setups, reaches an installed package and a plugin virtual module.
 * Disposal is registered by the caller through the returned `dispose`.
 */
export async function createEligibilityProject(options: EligibilityProjectOptions) {
  let virtualData = DEFAULT_VIRTUAL_DATA
  const root = await mkdtemp(join(tmpdir(), 'histoire-eligibility-project-'))
  await mkdir(join(root, 'node_modules/installed'), { recursive: true })
  await writeFile(join(root, 'node_modules/installed/package.json'), '{"name":"installed","type":"module","exports":"./index.js"}')
  await writeFile(join(root, 'node_modules/installed/index.js'), 'export const installed = 1')
  await writeFile(join(root, 'setup.js'), 'import "installed";import "virtual:data";export const setup = true')
  await writeFile(join(root, 'unrelated.ts'), 'export const unrelated = 1')
  for (const [file, code] of Object.entries(options.files ?? {})) await writeFile(join(root, file), code)
  const ctx = { root, storyFiles: options.stories.map(id => ({ id, path: join(root, `${id}.story.js`), story: { id, title: id, variants: [{ id: 'main', title: 'Main' }] } })) } as unknown as Context
  const server: ViteDevServer = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [collectionEligibilityTransformPlugin(ctx), {
      name: 'collection-evidence-fixture',
      /** Production setup ids resolve to this fixture's real setup graph. */
      resolveId(id) {
        if (id === SETUP_ID) return join(root, 'setup.js')
        if (id === GENERATED_GLOBAL_SETUP) return RESOLVED_GENERATED_GLOBAL_SETUP
        if (id === 'virtual:data') return '\0virtual:data'
      },
      /** Virtual bytes change without any watcher event. */
      load(id) {
        if (id === RESOLVED_GENERATED_GLOBAL_SETUP) return 'export {}'
        if (id === '\0virtual:data') return virtualData
      },
    }],
  })
  attachTestCollectionEligibility(ctx, server)
  return {
    ctx,
    root,
    server,
    /** Changes the virtual leaf's bytes; no watcher event follows. */
    setVirtualData(code: string) { virtualData = code },
    /** Closes the server and removes the project. */
    async dispose() {
      await server.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}
