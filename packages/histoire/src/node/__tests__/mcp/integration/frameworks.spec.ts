import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getProjectServices } from 'histoire/dist/node/api/internal.js'
import { createScreenshotTask } from 'histoire/dist/node/runtime/browser/screenshot.js'
import { createHistoireProject } from 'histoire/node'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMcpArtifact } from '../../utils/mcp/artifact-project.js'
import { inspectMcpFrameworkPreview } from '../../utils/mcp/framework-preview.js'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'
import { callMcp, closeMcpFixtures, connectMcpHttp, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await closeMcpFixtures(cleanup)
})

describe('real framework example conformance', () => {
  it.each(['react', 'svelte4', 'svelte5', 'sveltekit', 'nuxt4'] as const)('%s discovers stories and captures real preview', async (name) => {
    const project = await createMcpFrameworkProject(name)
    cleanup.push(project.close)
    const runtime = startMcpProcess(['dev', '--port', '0', '--mcp-port', '0'], project.root)
    cleanup.push(() => runtime.close())
    const endpoint = (await runtime.waitFor(/MCP: (http:\/\/\S+)/, 60000))[1]
    const client = await connectMcpHttp(endpoint)
    cleanup.push(() => client.close())
    const status = await waitMcp(() => callMcp(client, 'histoire_get_project'), value => ['ready', 'failed'].includes(value.data?.status))
    expect(status.data.status, JSON.stringify(status.data.diagnostics)).toBe('ready')
    expect(status.data.storyCount).toBeGreaterThan(0)
    if (name !== 'sveltekit') expect(status.data.base).toBe('/book/')
    const catalog = await callMcp(client, 'histoire_list_stories')
    const story = catalog.data.items.find((story: any) => name === 'svelte4' ? story.title === 'BaseButton' : !story.docsOnly && story.variants.length)
    expect(story).toBeDefined()
    expect((await callMcp(client, 'histoire_get_story', { storyId: story.id })).ok).toBe(true)
    const source = await callMcp(client, 'histoire_get_source', { storyId: story.id })
    expect(source.ok).toBe(true)
    const preview = await callMcp(client, 'histoire_get_preview', { storyId: story.id, variantId: story.variants[0].id })
    expect((await fetch(preview.data.storyUrl)).status).toBe(200)
    expect(status.data.capabilities.screenshots.available, status.data.capabilities.screenshots.reason).toBe(true)
    const job = await callMcp(client, 'histoire_capture_screenshot', { storyId: story.id, variantId: story.variants[0].id, width: 480, height: 320, requestKey: `framework-${name}` })
    expect(job.ok).toBe(true)
    const finished = await waitMcp(() => callMcp(client, 'histoire_get_operation', { operationId: job.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
    if (finished.data.state !== 'completed') {
      const normalPreview = await inspectMcpFrameworkPreview(preview.data.storyUrl)
      expect(finished.data.state, JSON.stringify({ operation: finished.data.error, normalPreview })).toBe('completed')
    }
    expect(finished.data, JSON.stringify(finished.data.error)).toMatchObject({ state: 'completed', result: { width: 480, height: 320 } })
    const image = await client.readResource({ uri: finished.data.result.artifactUri })
    expect(Buffer.from((image.contents[0] as any).blob, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    await client.close()
    await runtime.close()
    if (name === 'nuxt4') {
      const staticBuild = startMcpProcess(['build'], project.root)
      expect((await staticBuild.waitForExit()).code, staticBuild.output().slice(-2000)).toBe(0)
      const catalog = JSON.parse(await readFile(resolve(project.root, '.histoire/dist/histoire.json'), 'utf8'))
      expect(catalog.capture.base).toBe('/book/')
      const staticProject = await createHistoireProject({ root: project.root })
      try {
        const preview = await staticProject.preview({ host: '127.0.0.1', port: 0 })
        await preview.ready
        const current = getProjectServices(staticProject).preview!.current!
        const result = await current.execution.enqueue(createScreenshotTask({ root: project.root, host: current.registry, target: { origin: current.origin, epoch: current.epoch, storyId: story.id, variantId: story.variants[0].id, width: 480, height: 320, backgroundColor: current.snapshot.defaults.backgroundColor, textDirection: current.snapshot.defaults.textDirection, globals: current.snapshot.defaults.globals, isActive: current.isActive } })).result
        expect(result.result).toMatchObject({ width: 480, height: 320 })
        expect(preview.url).toContain('/book/')
      }
      finally { await staticProject.close() }
    }
    const build = startMcpProcess(['build', '--target', 'node'], project.root)
    expect((await build.waitForExit()).code, build.output().replace(/https?:\/\/\S+/g, '[local URL]')).toBe(0)
    const portable = await copyMcpArtifact(project.root)
    cleanup.push(portable.close)
    await project.close()
    await portable.addPlaywright()
    const deployed = startMcpProcess([], portable.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: 'ef'.repeat(32) }, resolve(portable.artifact, 'server.mjs'))
    cleanup.push(() => deployed.close())
    const deploymentEndpoint = (await deployed.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
    const production = await connectMcpHttp(deploymentEndpoint, {}, 'ef'.repeat(32))
    cleanup.push(() => production.close())
    const productionStatus = (await callMcp(production, 'histoire_get_project')).data
    expect(productionStatus.runtimeMode).toBe('node')
    if (name !== 'sveltekit') expect(productionStatus.base).toBe('/book/')
    const deployedJob = await callMcp(production, 'histoire_capture_screenshot', { storyId: story.id, variantId: story.variants[0].id, width: 480, height: 320, requestKey: `deployed-${name}` })
    expect(deployedJob.ok).toBe(true)
    const deployedResult = await waitMcp(() => callMcp(production, 'histoire_get_operation', { operationId: deployedJob.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
    if (deployedResult.data.state !== 'completed') {
      const preview = await callMcp(production, 'histoire_get_preview', { storyId: story.id, variantId: story.variants[0].id })
      const normalPreview = await inspectMcpFrameworkPreview(preview.data.storyUrl)
      expect(deployedResult.data.state, JSON.stringify({ operation: deployedResult.data.error, normalPreview })).toBe('completed')
    }
    expect(deployedResult.data, JSON.stringify(deployedResult.data.error)).toMatchObject({ state: 'completed', result: { width: 480, height: 320 } })
    const deployedImage = await production.readResource({ uri: deployedResult.data.result.artifactUri })
    expect(Buffer.from((deployedImage.contents[0] as any).blob, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
