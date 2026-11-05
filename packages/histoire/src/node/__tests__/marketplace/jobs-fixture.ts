import type { ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPlanStore } from '../../marketplace/changes/plan-store.js'
import { createJobRunner } from '../../marketplace/jobs/runner.js'
import { configTestProject } from '../utils/config-codemod.js'

/** Test metadata supplied as declarative planner input, without registry access. */
export const jobManifest: MarketplaceManifest = { displayName: 'Test', summary: 'Test plugin', category: 'testing', monogram: 'T', tint: 'blue', config: { import: 'TestPlugin' } }
/** Exact original bytes must survive every failed package-manager invocation. */
export const packageBytes = '{ "name": "fixture", "private": true }\r\n'
/** Non-text bytes make rollback assertions sensitive to encoding conversions. */
export const lockBytes = new Uint8Array([0, 255, 17, 10])
/** Real scratch project, planner and job runner using external fixture binaries. */
export async function jobProject(script: Record<string, unknown> = {}, afterInstall: 'restart' | 'ask' = 'restart', overrides: Partial<ChangeRequest> = {}) {
  const fixture = await configTestProject('export default { plugins: [] }\n')
  await writeFile(`${fixture.root}/package.json`, packageBytes)
  const manager = overrides.prefs?.packageManager ?? 'pnpm'
  const lockfile = manager === 'npm' ? 'package-lock.json' : manager === 'yarn' ? 'yarn.lock' : manager === 'bun' ? 'bun.lock' : 'pnpm-lock.yaml'
  if (!script.noLock) await writeFile(`${fixture.root}/${lockfile}`, lockBytes)
  if (script.berry) await writeFile(`${fixture.root}/.yarnrc.yml`, 'nodeLinker: node-modules\n')
  if (script.workspace) await writeFile(`${fixture.root}/pnpm-workspace.yaml`, 'packages: []\n')
  if (script.installedVersion) {
    const directory = `${fixture.root}/node_modules/test-plugin`
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/package.json`, JSON.stringify({ name: 'test-plugin', version: script.installedVersion, main: 'index.cjs' }))
    await writeFile(`${directory}/index.cjs`, 'exports.TestPlugin = () => ({ name: "test-plugin" })')
    await writeFile(`${fixture.root}/package.json`, '{ "devDependencies": { "test-plugin": "^0.8.0" } }\r\n')
    await writeFile(fixture.file, 'import { TestPlugin } from "test-plugin"; export default { plugins: [TestPlugin()] }\n')
  }
  await writeFile(`${fixture.root}/manager.json`, JSON.stringify({ lockfile, ...script }))
  const request: ChangeRequest = { kind: 'install', id: 'test-plugin', version: '1.2.3', prefs: { community: false, packageManager: 'pnpm', afterInstall, skippedVersions: {} }, ...overrides }
  const plans = createPlanStore({ root: fixture.root, configFile: fixture.file, resolvePlugin: async () => ({ manifest: jobManifest, version: '1.2.3' }) })
  const plan = await plans.plan(request)
  const env = { PATH: `${fileURLToPath(new URL('../fixtures/marketplace/bin', import.meta.url))}:${process.env.PATH}` }
  const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans, env })
  return { ...fixture, runner, plans, plan, request, env }
}

/** Acquires real context generations through the production restart coordinator. */
export async function jobCoordinator(root: string, watched = false) {
  const { createRestartCoordinator } = await import('../../../../../histoire-dev-proxy/src/lifecycle/coordinator.js')
  const { watchConfiguration } = await import('../../../../../histoire-dev-proxy/src/config/watcher.js')
  const { configurationWatchInputs } = await import('../../../../../histoire-dev-proxy/src/config/inputs.js')
  const { createContext, closeContext } = await import('../../context.js')
  return createRestartCoordinator({
    /** Loads actual package factories and inventory on every generation. */
    async acquire() {
      const context = await createContext({ root, mode: 'dev' })
      return { context, ready: Promise.resolve(), close: () => closeContext(context) }
    },
    /** Uses production byte-aware watcher for restart integration cases. */
    watch: watched
      ? async (runtime, restart) => {
        const watcher = await watchConfiguration(await configurationWatchInputs({ root }), restart)
        return () => watcher.close()
      }
      : undefined,
    isUnsafeCleanup: () => false,
    withDeadline: promise => promise,
  })
}
