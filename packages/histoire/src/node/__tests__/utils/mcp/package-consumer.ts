import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'
import { createMcpProcessEnvironment } from './process.js'

const execute = promisify(execFile)
/** Six local packages form the published Vue consumer dependency graph. */
const directories = ['histoire', 'histoire-app', 'histoire-controls', 'histoire-shared', 'histoire-vendors', 'histoire-plugin-vue']

/** Run a bounded package command without leaking server logs into normal output. */
export async function runPackageCommand(command: string, args: string[], cwd: string) {
  try {
    return await execute(command, args, { cwd, env: createMcpProcessEnvironment(), timeout: 240_000, maxBuffer: 2 * 1024 * 1024 })
  }
  catch (error: any) {
    throw new Error(`Package command failed: ${command} ${args.join(' ')}\n${String(error.stderr || error.stdout || error.message).slice(-8000)}`)
  }
}

/** Pack real workspace outputs, inspect main tarball, and install without peers. */
export async function createPackageConsumer(directory: string) {
  const tarDirectory = resolve(directory, 'tarballs')
  const root = resolve(directory, 'consumer')
  await mkdir(tarDirectory, { recursive: true })
  await mkdir(root)
  const packages: Record<string, string> = {}
  for (const name of directories) {
    const source = resolve(MCP_REPOSITORY_ROOT, 'packages', name)
    const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'))
    const tarName = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`
    await runPackageCommand('pnpm', ['pack', '--pack-destination', tarDirectory], source)
    packages[manifest.name] = `file:${resolve(tarDirectory, tarName)}`
  }
  const tarball = packages.histoire.slice(5)
  const inventory = (await runPackageCommand('tar', ['-tzf', tarball], root)).stdout.split('\n')
  for (const entry of ['dist/node/mcp/transport/worker-entry.js', 'dist/node/mcp/server/factory.js', 'dist/node/deploy/entry.js', 'dist/node/mcp/protocol/project-schema.d.ts', 'bin.mjs']) {
    if (!inventory.includes(`package/${entry}`)) throw new Error(`Published package missing ${entry}`)
  }
  if (inventory.some(path => /^package\/(?:src|scripts)\//.test(path) || /__tests__|fixtures|\.env(?:\.|$)/.test(path))) throw new Error('Published package contains source, fixtures, tests, or environment files')
  await writeFile(resolve(root, '.npmrc'), 'auto-install-peers=false\nstrict-peer-dependencies=false\n')
  const dependencies = {
    'histoire': packages.histoire,
    '@histoire/plugin-vue': packages['@histoire/plugin-vue'],
    'vue': await fixtureVersion('vue'),
    'vite': await fixtureVersion('vite'),
    '@vitejs/plugin-vue': await fixtureVersion('@vitejs/plugin-vue'),
  }
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies, pnpm: { overrides: packages, onlyBuiltDependencies: ['esbuild'] } }, null, 2))
  await runPackageCommand('pnpm', ['install', '--prefer-offline'], root)
  const installed = await realpath(resolve(root, 'node_modules/histoire'))
  if (installed.startsWith(MCP_REPOSITORY_ROOT)) throw new Error('Consumer resolved workspace package instead of packed package')
  await runPackageCommand(process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, ['--input-type=module', '-e', 'await import("histoire")'], root)
  for (const peer of ['playwright', 'vitest', '@vitest/browser-playwright']) {
    const result = await runPackageCommand(process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, ['--input-type=module', '-e', `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); try { require.resolve(${JSON.stringify(peer)}); process.exit(1) } catch(error) { if(error.code !== 'MODULE_NOT_FOUND') throw error }`], root)
    if (result.stderr) throw new Error(`Unexpected peer probe output: ${peer}`)
  }
  const require = createRequire(resolve(installed, 'package.json'))
  const appDirectory = resolve(dirname(require.resolve('@histoire/app/package.json')), 'dist')
  return { root, cli: resolve(root, 'node_modules/histoire/bin.mjs'), appDirectory, tarball, inventory }
}

/** Pin optional peers to the already verified fixture versions, then install. */
export async function installConsumerBrowserPeers(root: string) {
  const peers = await Promise.all(['playwright', 'vitest', '@vitest/browser-playwright'].map(async name => `${name}@${await fixtureVersion(name)}`))
  await runPackageCommand('pnpm', ['add', '-D', '--prefer-offline', ...peers], root)
}

/** Browser output must not include MCP SDK or Node transport module imports. */
export async function assertPackageBrowserBoundary(directory: string) {
  const paths = await readdir(directory, { recursive: true })
  for (const path of paths.filter(path => path.endsWith('.js'))) {
    const content = await readFile(resolve(directory, path), 'utf8')
    if (/@modelcontextprotocol|StreamableHTTPClientTransport|createMcpHandler|toNodeHandler|from\s*["']node:/.test(content)) throw new Error(`MCP/Node transport leaked into browser output: ${path}`)
  }
}

/** Read dependency version only; no dependency path escapes into consumer config. */
async function fixtureVersion(name: string): Promise<string> {
  return JSON.parse(await readFile(resolve(MCP_REPOSITORY_ROOT, 'examples/vue3/node_modules', name, 'package.json'), 'utf8')).version
}
