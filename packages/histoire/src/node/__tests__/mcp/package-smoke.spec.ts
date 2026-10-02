import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { expect, it } from 'vitest'
import { createMcpBrowserTestProject } from '../utils/mcp/browser-test-project.js'
import { MCP_REPOSITORY_ROOT } from '../utils/mcp/cli-project.js'
import { assertPackageBrowserBoundary, createPackageConsumer, installConsumerBrowserPeers, runPackageCommand } from '../utils/mcp/package-consumer.js'
import { probePackageBrowserExecution, probePackageJob, probePackageReads } from '../utils/mcp/package-probes.js'
import { assertMcpProcessReleased, closeMcpFixtures, connectMcpHttp, createMcpProcessEnvironment, startMcpProcess } from '../utils/mcp/process.js'

/** Real publication contents, clean installs, and copied deployment are one owned gate. */
it('serves packed Node 22 consumers and copied artifacts with optional peers isolated', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'histoire package smoke '))
  const fixture = await createMcpBrowserTestProject()
  const cleanup: (() => Promise<unknown>)[] = [() => rm(directory, { recursive: true, force: true }), fixture.close]
  try {
    const consumer = await createPackageConsumer(directory)
    for (const file of ['Book.story.vue', 'Book.story.md', 'Empty.story.vue', 'custom config.ts']) await cp(resolve(fixture.root, file), resolve(consumer.root, file))
    await writeFile(resolve(consumer.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { plugins: [vue()], server: { open: false } };`)
    await cp(resolve(consumer.root, 'custom config.ts'), resolve(consumer.root, 'histoire.config.ts'))
    await fixture.close()
    const manifest = JSON.parse(await readFile(resolve(consumer.root, 'node_modules/histoire/package.json'), 'utf8'))
    expect(manifest.dependencies.esbuild).toBeTruthy()
    expect(manifest.devDependencies?.esbuild).toBeUndefined()
    await assertPackageBrowserBoundary(consumer.appDirectory)

    // Parse the documented client object, substituting only installation paths.
    const guide = await readFile(resolve(MCP_REPOSITORY_ROOT, 'docs/guide/mcp.md'), 'utf8')
    const example = JSON.parse(guide.match(/```json\n([\s\S]*?)\n```/)![1]).mcpServers.histoire
    const args = example.args.map((argument: string) => argument.replace('/absolute/path/to/project/node_modules/histoire/bin.mjs', consumer.cli).replace('/absolute/path/to/project', consumer.root))
    const transport = new StdioClientTransport({ command: process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, args, cwd: tmpdir(), stderr: 'pipe', env: createMcpProcessEnvironment() as Record<string, string> })
    transport.stderr.on('data', () => {})
    const stdio = new Client({ name: 'packed-histoire', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    cleanup.push(() => stdio.close())
    await stdio.connect(transport)
    const status = await probePackageReads(stdio)
    expect(status.capabilities.screenshots.available).toBe(false)
    expect(status.capabilities.tests.available).toBe(false)
    const unavailable = await probePackageJob(stdio, 'histoire_capture_screenshot', 'missing-peer')
    expect(unavailable).toMatchObject({ state: 'failed', error: { code: 'DEPENDENCY_MISSING' } })
    expect(unavailable.error.message).toContain('playwright')
    const stdioPid = transport.pid
    await stdio.close()
    expect(() => process.kill(stdioPid, 0)).toThrow()

    await installConsumerBrowserPeers(consumer.root)
    const dev = startMcpProcess(['dev', '-c', 'custom config.ts', '--port', '0', '--mcp-port', '0'], consumer.root, { BROWSER: 'none' }, consumer.cli)
    cleanup.push(() => dev.close())
    const devEndpoint = (await dev.waitFor(/MCP: (http:\/\/\S+)/))[1]
    const devClient = await connectMcpHttp(devEndpoint)
    cleanup.push(() => devClient.close())
    await probePackageReads(devClient)
    await probePackageBrowserExecution(devClient, 'project-vitest')
    await devClient.close()
    const stoppedDev = await dev.close()
    expect(stoppedDev.signal).toBeNull()
    expect([0, 143]).toContain(stoppedDev.code)
    await assertMcpProcessReleased(dev.child, devEndpoint)

    const node = process.env.HISTOIRE_MCP_TEST_NODE || process.execPath
    await runPackageCommand(node, [consumer.cli, 'build', '-c', 'custom config.ts', '--target', 'static'], consumer.root)
    expect(await readFile(resolve(consumer.root, '.histoire/dist/index.html'), 'utf8')).toContain('<html')
    await assertPackageBrowserBoundary(resolve(consumer.root, '.histoire/dist/assets'))
    await runPackageCommand(node, [consumer.cli, 'build', '-c', 'custom config.ts', '--target', 'node'], consumer.root)
    const deployment = resolve(directory, 'copied deployment')
    await cp(resolve(consumer.root, '.histoire/dist'), deployment, { recursive: true })
    const artifactManifest = JSON.parse(await readFile(resolve(deployment, 'private/manifest.json'), 'utf8'))
    expect(artifactManifest.testRuntimeIncluded).toBe(true)
    const packageManifest = JSON.parse(await readFile(resolve(deployment, 'package.json'), 'utf8'))
    expect(Object.keys(packageManifest.optionalDependencies)).toEqual(['playwright'])
    await rm(consumer.root, { recursive: true, force: true })
    const token = 'ab'.repeat(32)
    const entry = resolve(deployment, 'server.mjs')
    const start = () => startMcpProcess(['--mcp'], tmpdir(), { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: token, BROWSER: 'none' }, entry)
    const nodeOnly = start()
    cleanup.push(() => nodeOnly.close())
    const endpoint = (await nodeOnly.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
    const client = await connectMcpHttp(endpoint, {}, token)
    cleanup.push(() => client.close())
    const copiedStatus = await probePackageReads(client)
    expect(copiedStatus).toMatchObject({ runtimeMode: 'node', capabilities: { screenshots: { available: false }, tests: { available: false } } })
    const failedJob = await probePackageJob(client, 'histoire_capture_screenshot', 'copied-no-playwright')
    expect(failedJob).toMatchObject({ state: 'failed', error: { code: 'DEPENDENCY_MISSING' } })
    expect((await fetch(endpoint.replace('/mcp', '/health'))).status).toBe(200)
    expect((await fetch(endpoint.replace('/mcp', '/ready'))).status).toBe(200)
    expect((await fetch(new URL('/private/manifest.json', endpoint))).status).toBe(404)
    expect((await fetch(endpoint, { method: 'POST', body: '{}' })).status).toBe(401)
    await client.close()
    expect(await nodeOnly.close()).toEqual({ code: 0, signal: null })
    await assertMcpProcessReleased(nodeOnly.child, endpoint)
    await runPackageCommand('pnpm', ['install', '--prefer-offline'], deployment)
    await runPackageCommand(node, ['--input-type=module', '-e', `import { createRequire } from 'node:module'; const require=createRequire(import.meta.url); require.resolve('playwright'); for (const name of ['vite','vitest','histoire','@vitest/browser-playwright']) { try { require.resolve(name); throw new Error('Unexpected deployed dependency: '+name) } catch(error) { if(error.code !== 'MODULE_NOT_FOUND') throw error } }`], deployment)
    const withBrowser = start()
    cleanup.push(() => withBrowser.close())
    const browserEndpoint = (await withBrowser.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
    const browserClient = await connectMcpHttp(browserEndpoint, {}, token)
    cleanup.push(() => browserClient.close())
    await probePackageBrowserExecution(browserClient, 'built-preview')
    await browserClient.close()
    expect(await withBrowser.close()).toEqual({ code: 0, signal: null })
    await assertMcpProcessReleased(withBrowser.child, browserEndpoint)
  }
  finally {
    await closeMcpFixtures(cleanup)
  }
})
