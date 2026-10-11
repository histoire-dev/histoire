import { Buffer } from 'node:buffer'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { checkConsumerSetup, createBrowserSetupConsumer, createIsolatedBrowserCache, writeConsumerProject } from '../../utils/mcp/browser-setup-consumer.js'
import { callMcp, connectMcpHttp, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

/** Capture through copied Node MCP, then decode actual browser pixels and DPR. */
async function captureNodeArtifact(entry: string, cache: string, theme: 'default' | 'contrast') {
  const token = 'ab'.repeat(32)
  const server = startMcpProcess(['--mcp'], tmpdir(), {
    HOST: '127.0.0.1',
    PORT: '0',
    HISTOIRE_MCP_TOKEN: token,
    HISTOIRE_BROWSER_SOURCE: 'headless-shell',
    PLAYWRIGHT_BROWSERS_PATH: cache,
  }, entry)
  let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
  try {
    const endpoint = (await server.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
    client = await connectMcpHttp(endpoint, {}, token)
    const project = await callMcp(client, 'histoire_get_project')
    expect(project.data.capabilities.screenshots.available).toBe(true)
    const admitted = await callMcp(client, 'histoire_capture_screenshot', {
      storyId: 'browser-setup',
      variantId: 'normal',
      requestKey: `core-only-${theme}`,
      width: 480,
      height: 320,
      deviceScaleFactor: 2,
      globals: { theme },
    })
    expect(admitted.ok).toBe(true)
    const operation = await waitMcp(() => callMcp(client!, 'histoire_get_operation', { operationId: admitted.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
    expect(operation.data, JSON.stringify(operation.data.error)).toMatchObject({ state: 'completed', result: { width: 960, height: 640, mimeType: 'image/png' } })
    const artifact = await client.readResource({ uri: operation.data.result.artifactUri })
    const content = artifact.contents[0]
    if (!('blob' in content)) throw new Error('Copied artifact returned no PNG bytes')
    const bytes = Buffer.from(content.blob, 'base64')
    const image = PNG.sync.read(bytes)
    expect([image.width, image.height]).toEqual([960, 640])
    /** Read one pixel in decoded RGBA order. */
    const pixel = (x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]
    expect(pixel(20, 20)).toEqual(theme === 'contrast' ? [0x12, 0x34, 0x56, 255] : [0xAB, 0xCD, 0xEF, 255])
    expect(pixel(900, 600)[3]).toBe(0)
    return operation.data.result.sha256 as string
  }
  finally {
    await client?.close()
    await server.close()
  }
}

it.runIf(process.env.HISTOIRE_BROWSER_SETUP_CONSUMER === '1')('proves packed core-only setup, cached renderer selection, and copied Node capture', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'histoire browser setup consumer '))
  try {
    const { consumer, browserPackage } = await createBrowserSetupConsumer(directory)
    const consumerRequire = createRequire(resolve(consumer.root, 'package.json'))
    expect(consumerRequire.resolve('playwright-core')).toContain('node_modules/playwright-core')
    expect(() => consumerRequire.resolve('playwright')).toThrow()

    const shellCache = await createIsolatedBrowserCache(directory, browserPackage, ['chromium-headless-shell'])
    const metadata = await checkConsumerSetup(consumer.cli, consumer.root, shellCache, false)
    expect(metadata).toEqual({ exit: 0, output: expect.objectContaining({ state: 'unverified' }) })

    const emptyCache = await createIsolatedBrowserCache(resolve(directory, 'metadata-only'), browserPackage, [])
    const emptyCheck = await checkConsumerSetup(consumer.cli, consumer.root, emptyCache)
    expect(emptyCheck).toMatchObject({
      exit: 1,
      output: {
        state: 'needs-action',
        reason: 'browser-missing',
        repairs: [{ id: 'install-core-shell', command: { executable: 'pnpm', args: ['exec', 'playwright-core', 'install', 'chromium', '--only-shell'] } }],
      },
    })

    const shellCheck = await checkConsumerSetup(consumer.cli, consumer.root, shellCache)
    expect(shellCheck).toEqual({ exit: 0, output: expect.objectContaining({ state: 'ready', source: 'headless-shell' }) })

    const fullCache = await createIsolatedBrowserCache(resolve(directory, 'full-only'), browserPackage, ['chromium'])
    const fullCheck = await checkConsumerSetup(consumer.cli, consumer.root, fullCache)
    expect(fullCheck).toEqual({ exit: 0, output: expect.objectContaining({ state: 'ready', source: 'chromium' }) })

    await writeConsumerProject(consumer.root, { source: 'executable', executablePath: './missing browser' })
    const explicitFailure = await checkConsumerSetup(consumer.cli, consumer.root, shellCache)
    expect(explicitFailure).toMatchObject({ exit: 1, output: { state: 'needs-action', reason: 'browser-missing', attempts: [{ source: 'executable', reason: 'browser-missing' }] } })

    await writeConsumerProject(consumer.root, { source: 'auto' })
    const build = startMcpProcess(['build', '-c', 'histoire.config.ts', '--target', 'node'], consumer.root, {}, consumer.cli)
    const buildResult = await build.waitForExit(600_000)
    if (buildResult.code !== 0) throw new Error(`Packed Node consumer build failed: ${build.output()}`)
    const artifactRoot = resolve(directory, 'copied artifact')
    await cp(resolve(consumer.root, '.histoire/dist'), artifactRoot, { recursive: true })
    const packageManifest = JSON.parse(await readFile(resolve(artifactRoot, 'package.json'), 'utf8'))
    const artifactManifest = JSON.parse(await readFile(resolve(artifactRoot, 'private/manifest.json'), 'utf8'))
    expect(Object.keys(packageManifest.optionalDependencies)).toEqual(['playwright-core'])
    expect(JSON.stringify({ packageManifest, artifactManifest })).not.toContain(consumer.root)
    await mkdir(resolve(artifactRoot, 'node_modules'), { recursive: true })
    await cp(resolve(consumer.root, 'node_modules/playwright-core'), resolve(artifactRoot, 'node_modules/playwright-core'), { recursive: true })
    await rm(consumer.root, { recursive: true, force: true })
    const artifactRequire = createRequire(resolve(artifactRoot, 'package.json'))
    expect(artifactRequire.resolve('playwright-core')).toContain('node_modules/playwright-core')
    for (const name of ['playwright', 'vitest', '@vitest/browser-playwright']) expect(() => artifactRequire.resolve(name)).toThrow()

    const defaultHash = await captureNodeArtifact(resolve(artifactRoot, 'server.mjs'), shellCache, 'default')
    const contrastHash = await captureNodeArtifact(resolve(artifactRoot, 'server.mjs'), shellCache, 'contrast')
    expect(contrastHash).not.toBe(defaultHash)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 600_000)
