import { readdir, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createPackedPackageConsumer, fixturePackageVersion, runPackageCommand } from '../package-consumer.js'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'

export { runPackageCommand } from '../package-consumer.js'

/** Pack real workspace outputs, inspect main tarball, and install without peers. */
export async function createPackageConsumer(directory: string) {
  const consumer = await createPackedPackageConsumer(directory, { packages: ['histoire', '@histoire/plugin-vue'], dependencies: { 'vue': await fixturePackageVersion('vue'), 'vite': await fixturePackageVersion('vite'), '@vitejs/plugin-vue': await fixturePackageVersion('@vitejs/plugin-vue') } })
  const { root, packages } = consumer
  const tarball = packages.histoire.slice(5)
  const inventory = consumer.inventories.histoire
  for (const entry of ['dist/node/mcp/transport/worker-entry.js', 'dist/node/mcp/server/factory.js', 'dist/node/deploy/entry.js', 'dist/node/mcp/protocol/project-schema.d.ts', 'bin.mjs']) {
    if (!inventory.includes(`package/${entry}`)) throw new Error(`Published package missing ${entry}`)
  }
  if (inventory.some(path => /^package\/(?:src|scripts)\//.test(path) || /__tests__|fixtures|\.env(?:\.|$)/.test(path))) throw new Error('Published package contains source, fixtures, tests, or environment files')
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
  const peers = await Promise.all(['playwright', 'vitest', '@vitest/browser-playwright'].map(async name => `${name}@${await fixturePackageVersion(name)}`))
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
