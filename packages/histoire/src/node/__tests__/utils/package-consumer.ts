import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { MCP_REPOSITORY_ROOT } from './mcp/cli-project.js'
import { createPackageProcessEnvironment } from './process-environment.js'

const execute = promisify(execFile)

/** One bounded command helper shared by SDK and MCP installed-consumer gates. */
export async function runPackageCommand(command: string, args: string[], cwd: string) {
  try {
    return await execute(command, args, { cwd, env: createPackageProcessEnvironment(), timeout: 240_000, maxBuffer: 2 * 1024 * 1024 })
  }
  catch (error: any) {
    throw new Error(`Package command failed: ${command} ${args.join(' ')}\n${String(error.stderr || error.stdout || error.message).slice(-8000)}`)
  }
}

/** Read installed version only; repository resolution never enters consumer configuration. */
export async function fixturePackageVersion(name: string, example = 'vue3'): Promise<string> {
  const manifest = resolve(MCP_REPOSITORY_ROOT, 'examples', example, 'node_modules', name, 'package.json')
  return JSON.parse(await readFile(manifest, 'utf8')).version
}

/** Pack unchanged source manifest once for closure installs or independent metadata probes. */
export async function packConsumerPackage(source: string, tarDirectory: string) {
  await mkdir(tarDirectory, { recursive: true })
  const sourceManifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
  await runPackageCommand('pnpm', ['pack', '--pack-destination', tarDirectory], source)
  const name: string = sourceManifest.name
  const tarball = resolve(tarDirectory, `${name.replace('@', '').replace('/', '-')}-${sourceManifest.version}.tgz`)
  const manifest = JSON.parse((await runPackageCommand('tar', ['-xOzf', tarball, 'package/package.json'], tarDirectory)).stdout)
  const inventory = (await runPackageCommand('tar', ['-tzf', tarball], tarDirectory)).stdout.split('\n').filter(Boolean)
  return { name, tarball, manifest, inventory }
}

/** Public manifests are packed unchanged; recursive closure includes newly extracted packages. */
export async function createPackedPackageConsumer(directory: string, options: {
  /** First-party entry packages required by this external gate. */
  packages: readonly string[]
  /** Exact installed external versions; optional browser peers remain absent unless requested. */
  dependencies?: Record<string, string>
}) {
  const tarDirectory = resolve(directory, 'tarballs')
  const root = resolve(directory, 'consumer')
  await mkdir(tarDirectory, { recursive: true })
  await mkdir(root)
  const workspace = new Map<string, { path: string, manifest: any }>()
  for (const entry of await readdir(resolve(MCP_REPOSITORY_ROOT, 'packages'))) {
    const path = resolve(MCP_REPOSITORY_ROOT, 'packages', entry)
    const manifest = JSON.parse(await readFile(resolve(path, 'package.json'), 'utf8'))
    workspace.set(manifest.name, { path, manifest })
  }
  const packages: Record<string, string> = {}
  const manifests: Record<string, any> = {}
  const inventories: Record<string, string[]> = {}
  const pending = [...options.packages]
  while (pending.length) {
    const name = pending.shift()!
    if (packages[name]) continue
    const source = workspace.get(name)
    if (!source) throw new Error(`Unknown local consumer package: ${name}`)
    const packed = await packConsumerPackage(source.path, tarDirectory)
    packages[name] = `file:${packed.tarball}`
    manifests[name] = packed.manifest
    inventories[name] = packed.inventory
    for (const dependency of Object.keys({ ...source.manifest.dependencies, ...source.manifest.peerDependencies })) {
      if (workspace.has(dependency)) pending.push(dependency)
    }
  }
  // Owned fixture uses real local tarballs for every first-party dependency.
  // Overrides prevent unpublished versions falling back to registry/workspace resolution.
  await writeFile(resolve(root, '.npmrc'), 'auto-install-peers=false\nstrict-peer-dependencies=false\n')
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { ...packages, ...options.dependencies }, pnpm: { overrides: packages, onlyBuiltDependencies: ['esbuild'] } }, null, 2))
  await runPackageCommand('pnpm', ['install', '--prefer-offline'], root)
  for (const name of Object.keys(packages)) {
    const installed = await realpath(resolve(root, 'node_modules', name))
    if (installed.startsWith(MCP_REPOSITORY_ROOT)) throw new Error(`Consumer resolved workspace package: ${name}`)
  }
  return { root, packages, manifests, inventories }
}
