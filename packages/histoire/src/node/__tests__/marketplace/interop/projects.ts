import type { ChangeRequest } from '@histoire/shared'
import type { ManagerName } from './managers.js'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { expect, onTestFinished, vi } from 'vitest'
import { createRegistryClient } from '../../../marketplace/catalog/registry.js'
import { getPlanStore } from '../../../marketplace/changes/handlers.js'
import { createJobRunner } from '../../../marketplace/jobs/runner.js'
import { spawnPackage } from '../../../marketplace/jobs/spawn.js'
import { configTestProject } from '../../utils/config-codemod.js'
import { jobCoordinator } from '../jobs-fixture.js'
import { availableManagers, corepackEnvironment } from './managers.js'
import { interopRegistry, pluginId, registryToken } from './registry-server.js'

export { availableManagers } from './managers.js'
export { pluginId } from './registry-server.js'

/** Scenario setup choices; all package writes stay inside temporary roots. */
interface ProjectOptions {
  /** Start with real installed 1.0.0 and migration input. */ installed?: boolean
  /** Require npmrc credentials for metadata and archives. */ authenticated?: boolean
}

/** Create isolated manager state, real registry, planner, runner and context generations. */
export async function interopProject(manager: ManagerName, options: ProjectOptions = {}) {
  const registry = await interopRegistry(options.authenticated)
  onTestFinished(registry.close)
  const fixture = await configTestProject('export default { plugins: [] }\n')
  const { root, file } = fixture
  const state = join(root, '.manager')
  await mkdir(join(state, 'bin'), { recursive: true })
  const discovered = (await availableManagers()).find(item => item.name === manager)!
  if (!discovered.binary) throw new Error(`Missing real ${manager}`)
  await symlink(discovered.binary, join(state, 'bin', manager))
  const userconfig = join(state, 'user.npmrc')
  const globalconfig = join(state, 'global.npmrc')
  await writeFile(userconfig, '')
  await writeFile(globalconfig, '')
  const npmrc = [
    `registry=${registry.url}/`,
    `cache=${state}/npm-cache`,
    `store-dir=${state}/pnpm-store`,
    'audit=false',
    'fund=false',
    'update-notifier=false',
    'ignore-scripts=true',
    'strict-peer-dependencies=true',
    'auto-install-peers=false',
    'offline=false',
    'manage-package-manager-versions=false',
    ...(options.authenticated ? [registry.url, registry.tarballUrl].map(url => `//${new URL(url).host}/:_authToken=${registryToken}`) : []),
  ].join('\n')
  await writeFile(join(root, '.npmrc'), `${npmrc}\n`)
  if (manager === 'pnpm') await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []\nstrictPeerDependencies: true\nautoInstallPeers: false\nmanagePackageManagerVersions: false\n')
  // Discard inherited scoped registries, auth and user config before setting our
  // explicit loopback-only environment, also used by in-process registry clients.
  for (const key of Object.keys(process.env)) {
    if (/^npm_config_/i.test(key) || /^(?:http|https|all)_proxy$/i.test(key)) vi.stubEnv(key, undefined)
  }
  const environment: NodeJS.ProcessEnv = {
    ...corepackEnvironment,
    COREPACK_ENABLE_PROJECT_SPEC: '1',
    // Corepack distributions are preinstalled executables, not project caches.
    // Keep their read-only lookup stable when project XDG caches are isolated.
    COREPACK_HOME: process.env.COREPACK_HOME ?? join(process.env.XDG_CACHE_HOME ?? join(process.env.HOME!, '.cache'), 'node/corepack'),
    PATH: `${state}/bin:${dirname(process.execPath)}:${process.env.PATH}`,
    npm_config_registry: `${registry.url}/`,
    npm_config_userconfig: userconfig,
    npm_config_globalconfig: globalconfig,
    npm_config_cache: `${state}/npm-cache`,
    npm_config_offline: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_strict_peer_dependencies: 'true',
    npm_config_auto_install_peers: 'false',
    npm_config_manage_package_manager_versions: 'false',
    npm_config_store_dir: `${state}/pnpm-store`,
    PNPM_HOME: `${state}/pnpm-home`,
    YARN_CACHE_FOLDER: `${state}/yarn-cache`,
    BUN_INSTALL_CACHE_DIR: `${state}/bun-cache`,
    XDG_CACHE_HOME: `${state}/xdg-cache`,
    XDG_CONFIG_HOME: `${state}/xdg-config`,
    YARN_REGISTRY: `${registry.url}/`,
    YARN_NPM_REGISTRY_SERVER: `${registry.url}/`,
    BUN_CONFIG_NO_CLEAR_TERMINAL: '1',
    NO_PROXY: '127.0.0.1',
  }
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
  const initial = { name: 'marketplace-interop-project', private: true, version: '1.0.0', packageManager: `${manager}@${discovered.reason}`, devDependencies: { vite: '6.1.0', ...(options.installed ? { [pluginId]: '1.0.0' } : {}) } }
  await writeFile(join(root, 'package.json'), `${JSON.stringify(initial, null, 2)}\n`)
  let output = ''
  await spawnPackage([join(state, 'bin', manager), 'install'], root, AbortSignal.timeout(30_000), (chunk) => {
    output += chunk
  }, process.env).catch((error) => {
    throw new Error(`Initial ${manager} install failed: ${output}`, { cause: error })
  })
  if (options.installed) await writeFile(file, `import { TestPlugin } from '${pluginId}'\nexport default { plugins: [TestPlugin({ old: 'retained', keep: true })] }\n`)
  const lockfile = join(root, { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: 'bun.lock' }[manager])
  const coordinator = await jobCoordinator(root)
  onTestFinished(() => coordinator.close())
  await coordinator.start()
  let reviewedConfig: string | undefined
  /** Assert every configured route, received request and saved resolution stays local. */
  async function assertLocalRequests() {
    expect(new URL(environment.npm_config_registry!).hostname).toBe('127.0.0.1')
    expect(npmrc.match(/https?:\/\/\S+/g)?.every(url => new URL(url).hostname === '127.0.0.1')).toBe(true)
    expect(registry.requests.length).toBeGreaterThan(0)
    expect(registry.tarballRequests.length).toBeGreaterThan(0)
    expect(registry.headers.every(header => header.host === new URL(registry.url).host)).toBe(true)
    expect(registry.tarballRequests.every(request => request.url.hostname === '127.0.0.1')).toBe(true)
    const saved = await readFile(lockfile, 'utf8')
    expect(saved.match(/https?:\/\/[^\s"']+/g)?.every(url => new URL(url).hostname === '127.0.0.1') ?? true).toBe(true)
    for (const key of ['npm_config_cache', 'npm_config_store_dir', 'PNPM_HOME', 'YARN_CACHE_FOLDER', 'BUN_INSTALL_CACHE_DIR']) expect(resolve(environment[key]!).startsWith(`${root}/`)).toBe(true)
  }
  return { ...fixture, lockfile,
    /** Exact reviewed source for migration assertions. */
    get reviewedConfig() { return reviewedConfig },
    /** Parse fresh on-disk manifest after the process has completed. */
    async manifest() { return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) },
    /** Inspect actual installed package, independent of requested dependency range. */
    async version() { return JSON.parse(await readFile(join(root, 'node_modules', pluginId, 'package.json'), 'utf8')).version },
    /** Independent dependency proves unrelated installed state survives repair/removal. */
    async peerVersion() { return JSON.parse(await readFile(join(root, 'node_modules/vite/package.json'), 'utf8')).version },
    /** Independent immutable snapshots protect exact manifest, lockfile and config bytes. */
    async bytes() { return Promise.all([join(root, 'package.json'), lockfile, file].map(path => readFile(path))) },
    /** Execute production review, admission, child process, config write and restart/load. */
    async change(kind: ChangeRequest['kind'], version: string, migrate = false) {
      const context = (await coordinator.waitForReady()).context
      await createRegistryClient(root).packument(pluginId)
      const plans = getPlanStore(context)
      const request: ChangeRequest = { kind, id: pluginId, version, migrate, prefs: { community: true, packageManager: manager, afterInstall: 'restart', skippedVersions: {} } }
      const plan = await plans.plan(request)
      expect(plan.manual).toBeUndefined()
      const config = plan.files.find(item => item.path === 'histoire.config.ts')
      if (config) reviewedConfig = `${config.lines.filter(line => line.kind !== 'del').map(line => line.text).join('\n')}\n`
      const runner = createJobRunner({ root, configFile: file, plans, context, env: environment })
      const started = await runner.start(plan.planId, plan.hash)
      const deadline = setTimeout(() => {
        void runner.cancel(started.jobId).catch(() => {})
      }, 30_000)
      try {
        await runner.wait()
      }
      finally {
        clearTimeout(deadline)
      }
      let job = await runner.current()
      if (job?.status === 'running') {
        const successor = await coordinator.restart()
        job = await createJobRunner({ root, configFile: file, plans: getPlanStore(successor.context), context: successor.context }).current()
      }
      await assertLocalRequests()
      return job
    },
    /** Protected services reject missing tokens, including archive requests. */
    async assertAuthenticatedRequests() {
      expect(registry.headers.length).toBeGreaterThan(0)
      expect(registry.tarballRequests.length).toBeGreaterThan(0)
      expect(registry.headers.every(header => header.authorization === `Bearer ${registryToken}`)).toBe(true)
      expect(registry.tarballRequests.every(request => request.authorization === `Bearer ${registryToken}`)).toBe(true)
      expect(await readFile(lockfile, 'utf8')).not.toContain(registryToken)
    } }
}
