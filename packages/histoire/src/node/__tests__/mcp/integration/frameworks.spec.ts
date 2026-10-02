import { Buffer } from 'node:buffer'
import { resolve } from 'node:path'
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
  it.each(['svelte4', 'svelte5', 'sveltekit', 'nuxt4'] as const)('%s discovers stories and captures real preview', async (name) => {
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
    if (!['nuxt4', 'sveltekit'].includes(name)) expect(status.data.base).toBe('/book/')
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
    expect((await callMcp(production, 'histoire_get_project')).data.runtimeMode).toBe('node')
    const deployedJob = await callMcp(production, 'histoire_capture_screenshot', { storyId: story.id, variantId: story.variants[0].id, width: 480, height: 320, requestKey: `deployed-${name}` })
    expect(deployedJob.ok).toBe(true)
    const deployedResult = await waitMcp(() => callMcp(production, 'histoire_get_operation', { operationId: deployedJob.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
    expect(deployedResult.data, JSON.stringify(deployedResult.data.error)).toMatchObject({ state: 'completed', result: { width: 480, height: 320 } })
    const deployedImage = await production.readResource({ uri: deployedResult.data.result.artifactUri })
    expect(Buffer.from((deployedImage.contents[0] as any).blob, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
