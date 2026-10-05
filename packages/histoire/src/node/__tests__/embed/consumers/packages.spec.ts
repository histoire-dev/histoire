import { once } from 'node:events'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { probeConsumerExamples } from '../../utils/embed/consumer-browser.js'
import { proveConsumerColdSource } from '../../utils/embed/consumer-cold.js'
import { compileConsumerTypes, prepareConsumerBook, prepareConsumerExamples, readConsumerGraph } from '../../utils/embed/consumer-project.js'
import { buildConsumerBook, createConsumerExampleHost, startConsumerNodeExample } from '../../utils/embed/consumer-runtime.js'
import { createEmbedHosts } from '../../utils/embed/hosts.js'
import { MCP_REPOSITORY_ROOT } from '../../utils/mcp/cli-project.js'
import { assertMcpProcessReleased, closeMcpFixtures } from '../../utils/mcp/process.js'
import { createMcpProjectFixture } from '../../utils/mcp/project.js'
import { createPackedPackageConsumer, fixturePackageVersion, runPackageCommand } from '../../utils/package-consumer.js'

describe('clean SDK package consumers', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  let consumer: Awaited<ReturnType<typeof createPackedPackageConsumer>>
  let hosts: Awaited<ReturnType<typeof createEmbedHosts>>
  let examples: Awaited<ReturnType<typeof createConsumerExampleHost>>
  let book: string
  const cleanup: (() => Promise<unknown>)[] = []
  beforeAll(async () => {
    fixture = await createMcpProjectFixture()
    cleanup.push(() => fixture.close())
    const dependencies = Object.fromEntries(await Promise.all(['vue', 'vite', 'typescript', '@types/node', '@vitejs/plugin-vue', 'ws', '@types/ws'].map(async name => [name, await fixturePackageVersion(name, ['typescript', '@types/node', 'ws', '@types/ws'].includes(name) ? 'embed-node' : 'vue3')])))
    consumer = await createPackedPackageConsumer(fixture.root, { packages: ['@histoire/sdk', '@histoire/vue', 'histoire', '@histoire/plugin-vue'], dependencies })
    hosts = await createEmbedHosts({ sdkEntry: join(consumer.root, 'node_modules/@histoire/sdk/dist/index.js') })
    cleanup.push(() => hosts.close())
    examples = await createConsumerExampleHost(consumer.root)
    cleanup.push(() => examples.close())
    book = await prepareConsumerBook(consumer.root, [examples.origin, hosts.hostOrigin])
    await prepareConsumerExamples(consumer.root)
  })
  afterAll(() => closeMcpFixtures(cleanup))

  it('installs complete local closure with public types, host Vue peer and all runtime assets', async () => {
    for (const name of ['@histoire/protocol', '@histoire/sdk', '@histoire/vue', '@histoire/app', '@histoire/controls', '@histoire/shared', '@histoire/vendors', 'histoire', '@histoire/plugin-vue']) {
      expect(consumer.packages[name], `${name} packed`).toBeTruthy()
      expect((await realpath(join(consumer.root, 'node_modules', name))).startsWith(MCP_REPOSITORY_ROOT)).toBe(false)
      expect(JSON.stringify(consumer.manifests[name])).not.toContain('workspace:')
    }
    for (const [name, entries] of Object.entries({
      '@histoire/sdk': ['dist/index.js', 'dist/index.d.ts'],
      '@histoire/vue': ['dist/index.js', 'dist/index.d.ts', 'dist/style.css'],
      '@histoire/controls': ['dist/peer/index.js', 'dist/peer/index.d.ts', 'dist/peer/style.css'],
      '@histoire/app': ['dist/embed/index.js', 'dist/embed/source.js', 'dist/style.css'],
      'histoire': ['dist/node/api/index.js', 'dist/node/api/index.d.ts', 'dist/node/virtual/preview-runtime/runtime-service.js'],
    })) {
      for (const entry of entries) expect(consumer.inventories[name]).toContain(`package/${entry}`)
    }
    expect(consumer.manifests['@histoire/vue'].peerDependencies.vue).toBeTruthy()
    expect(consumer.manifests['@histoire/vue'].dependencies.vue).toBeUndefined()
    const node = process.execPath
    await runPackageCommand(node, ['--input-type=module', '-e', `
      delete globalThis.window;delete globalThis.document;
      const sdk=await import('@histoire/sdk');const protocol=await import('@histoire/protocol');
      const native=await import('@histoire/vue');const controls=await import('@histoire/controls/vue');
      const {createHistoireProject}=await import('histoire/node');
      if(!native.HistoireExplorer||!native.HistoireTests||!controls.HstText||!protocol.HISTOIRE_SURFACES||!createHistoireProject)throw new Error('Missing public entry');
      const session=sdk.createHistoireSession({url:'https://book.example/'});await session.dispose();
      for(const peer of ['playwright','vitest','@vitest/browser-playwright']){try{await import(peer);throw new Error('Unexpected optional peer '+peer)}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}}
    `], consumer.root)
    expect((await readFile(join(consumer.root, 'node_modules/@histoire/vue/dist/style.css'), 'utf8')).length).toBeGreaterThan(0)
    for (const name of ['@histoire/sdk', '@histoire/protocol']) {
      for (const path of (await readdir(join(consumer.root, 'node_modules', name, 'dist'), { recursive: true })).filter(path => path.endsWith('.d.ts'))) {
        expect(await readFile(join(consumer.root, 'node_modules', name, 'dist', path), 'utf8')).not.toMatch(/(?:from|import\()\s*['"](?:vue|vite|histoire|@histoire\/(?:app|vendors)|node:)/)
      }
    }
  })

  it('compiles public declarations and real example bundles with one host Vue and lazy content tools', async () => {
    await compileConsumerTypes(consumer.root)
    expect(hosts.sdkInputs.join('\n')).not.toMatch(/(?:histoire[-+]|@histoire\/)(?:app|vue|vendors)|\/node_modules\/(?:vue|vite)\/|node:/)
    for (const example of ['embed-vanilla', 'embed-vue'] as const) {
      const graph = await readConsumerGraph(consumer.root, example)
      const all = Object.values(graph).flatMap(chunk => chunk.modules)
      expect(all.some(path => path.startsWith(MCP_REPOSITORY_ROOT))).toBe(false)
      expect(all.join('\n')).not.toMatch(/histoire-app|@histoire\/app|@modelcontextprotocol|node:/)
      if (example === 'embed-vanilla') {
        expect(all.join('\n')).not.toMatch(/\/node_modules\/(?:vue|@vue|floating-vue)\/|shiki|dompurify/)
      }
      else {
        const vueRoots = new Set(all.flatMap(path => path.match(/.*\/node_modules\/vue\//) ?? []))
        expect(vueRoots.size).toBe(1)
        expect(all.join('\n')).not.toMatch(/histoire-vendors|@histoire\/vendors/)
        // Follow every static import, so vendor chunks cannot hide eager content tools.
        const reachable = new Set<string>()
        const pending = Object.keys(graph).filter(file => graph[file].entry)
        while (pending.length) {
          const file = pending.pop()!
          if (reachable.has(file)) continue
          reachable.add(file)
          pending.push(...(graph[file]?.imports ?? []))
        }
        const initialModules = [...reachable].flatMap(file => graph[file]?.modules ?? []).join('\n')
        expect(initialModules).not.toMatch(/node_modules\/(?:dompurify|shiki|@shikijs)\//)
        expect(all.some(path => /node_modules\/dompurify\//.test(path))).toBe(true)
        expect(all.some(path => /node_modules\/(?:shiki|@shikijs)\//.test(path))).toBe(true)
      }
    }
  })

  it('runs installed Node middleware and examples without browser-test peers, preserving caller HTTP and WebSocket', async () => {
    const host = await startConsumerNodeExample(consumer.root, book)
    const { WebSocket } = createRequire(join(consumer.root, 'package.json'))('ws')
    const socket = new WebSocket(`${host.origin.replace(/^http/, 'ws')}/echo`)
    try {
      await once(socket, 'open')
      const echoed = once(socket, 'message')
      socket.send('before Histoire close')
      expect(String((await echoed)[0])).toBe('before Histoire close')
      expect(await (await fetch(`${host.origin}/api/health`)).json()).toEqual({ host: 'ready', histoire: 'ready' })
      await proveConsumerColdSource(hosts.hostOrigin, host.bookUrl, host.output)
      try {
        await probeConsumerExamples(examples.origin, host.bookUrl, ['explorer'])
      }
      catch (error) { throw new Error(`Installed dev source log: ${host.output().slice(-6000)}`, { cause: error }) }
      expect((await fetch(`${host.origin}/api/histoire/close`, { method: 'POST' })).status).toBe(200)
      expect(await (await fetch(`${host.origin}/api/health`)).json()).toEqual({ host: 'ready', histoire: 'closed' })
      const after = once(socket, 'message')
      socket.send('after Histoire close')
      expect(String((await after)[0])).toBe('after Histoire close')
    }
    finally {
      socket.terminate()
      await host.close()
      await assertMcpProcessReleased(host.child, host.origin)
    }
  })

  it('serves static nested book and lazy assets through packed SDK/native examples with explicit hidden runtime', async () => {
    const built = await buildConsumerBook(consumer.root, book)
    try {
      expect(JSON.parse(await readFile(join(consumer.root, 'book-build.json'), 'utf8')).testError).toBe('DEPENDENCY_MISSING')
      for (const file of await readdir(join(consumer.root, 'built-book'), { recursive: true })) {
        if (!/\.(?:html|json|js|css|svg|woff2?|wasm)$/.test(file)) continue
        const response = await fetch(`${built.bookUrl}${file.split('/').map(encodeURIComponent).join('/')}`)
        expect(response.status, `deployed ${file}`).toBe(200)
        expect((await response.arrayBuffer()).byteLength, `deployed ${file}`).toBeGreaterThan(0)
      }
      await probeConsumerExamples(examples.origin, built.bookUrl, ['parts', 'hidden', 'native'])
    }
    finally { await built.close() }
  })
})
