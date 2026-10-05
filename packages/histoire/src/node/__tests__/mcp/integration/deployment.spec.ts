import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMcpArtifactProject } from '../../utils/mcp/artifact-project.js'
import { assertMcpProcessReleased, callMcp, connectMcpHttp, MCP_PROTOCOLS, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

const token = 'ab'.repeat(32)
let fixture: Awaited<ReturnType<typeof createMcpArtifactProject>>
beforeAll(async () => {
  fixture = await createMcpArtifactProject()
  await writeFile(resolve(fixture.artifact, 'resolution.mjs'), 'import {createRequire} from \'node:module\'; const r=createRequire(import.meta.url); try{console.log(r.resolve(\'playwright\'))}catch{console.log(\'ABSENT\')}\n')
  const probe = startMcpProcess([], fixture.unrelated, {}, resolve(fixture.artifact, 'resolution.mjs'))
  await probe.completion
  expect(probe.output()).toContain('ABSENT')
})
afterAll(async () => {
  await fixture?.close()
})

describe('copied Node artifact without original project', () => {
  it.each(MCP_PROTOCOLS)('serves immutable reads and protected routing with %s', async (version, options) => {
    const runtime = startMcpProcess([], fixture.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: token }, resolve(fixture.artifact, 'server.mjs'))
    let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
    try {
      const endpoint = (await runtime.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
      client = await connectMcpHttp(endpoint, options, token)
      expect(client.getNegotiatedProtocolVersion()).toBe(version)
      const status = await callMcp(client, 'histoire_get_project')
      expect(status.data).toMatchObject({ runtimeMode: 'node', status: 'ready', base: '/book/', routerMode: 'history', capabilities: { screenshots: { available: false }, tests: { available: false } } })
      expect(JSON.stringify(status)).not.toContain(fixture.root)
      expect((await client.listTools()).tools).toHaveLength(14)
      const stories = await callMcp(client, 'histoire_list_stories')
      expect(stories.data.items.map((story: any) => story.id)).toContain('..')
      const story = await callMcp(client, 'histoire_get_story', { storyId: '..' })
      const docs = await callMcp(client, 'histoire_get_docs', { storyId: '..' })
      const source = await callMcp(client, 'histoire_get_source', { storyId: '..' })
      const preview = await callMcp(client, 'histoire_get_preview', { storyId: '..', variantId: 'a:/雪' })
      expect(docs.data.text).toBe('# Portable original docs\r\n😀\r\n')
      expect(source.data.text).toContain('Mocked greeting')
      expect((await client.readResource({ uri: story.data.resources.docs })).contents[0]).toMatchObject({ text: docs.data.text })
      expect((await client.readResource({ uri: story.data.resources.source })).contents[0]).toMatchObject({ text: source.data.text })
      const origin = new URL(endpoint).origin
      expect((await fetch(`${origin}/book/__histoire/health`)).status).toBe(200)
      expect((await fetch(`${origin}/book/__histoire/ready`)).status).toBe(200)
      expect((await fetch(preview.data.storyUrl, { headers: { Accept: 'text/html' } })).status).toBe(200)
      expect((await fetch(`${origin}/book/story/portable`, { headers: { Accept: 'text/html' } })).status).toBe(200)
      for (const path of ['private/manifest.json', 'private/content/a.txt', 'server.mjs', 'package.json', 'assets/missing.js', '%2e%2e/private/manifest.json', '%252e%252e/private/manifest.json']) {
        expect((await fetch(`${origin}/book/${path}`, { headers: { Accept: 'text/html' } })).status, path).toBe(404)
      }
      expect((await fetch(endpoint, { method: 'POST', body: '{}' })).status).toBe(401)
      expect((await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' }, body: '{}' })).status).toBe(403)
      const forwarded = await fetch(`${origin}/book/__histoire/health`, { headers: { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' } })
      expect(forwarded.status).toBe(200)
      const unavailable = await callMcp(client, 'histoire_capture_screenshot', { storyId: '..', variantId: 'a:/雪', requestKey: `missing-browser-${version}` })
      if (unavailable.ok) {
        const failed = await waitMcp(() => callMcp(client!, 'histoire_get_operation', { operationId: unavailable.data.operationId }), value => ['failed', 'completed', 'cancelled'].includes(value.data?.state))
        expect(failed.data).toMatchObject({ state: 'failed', error: { code: 'DEPENDENCY_MISSING' } })
      }
      else {
        expect(unavailable).toMatchObject({ error: { code: 'DEPENDENCY_MISSING' } })
      }
      await client.close()
      expect(await runtime.close()).toEqual({ code: 0, signal: null })
      await assertMcpProcessReleased(runtime.child, endpoint)
      expect(fixture.staticHtml).toContain('/book/assets/')
    }
    finally {
      await client?.close()
      await runtime.close()
    }
  })

  it('fails startup without required bearer credential', async () => {
    const runtime = startMcpProcess([], fixture.unrelated, { HOST: '127.0.0.1', PORT: '0' }, resolve(fixture.artifact, 'server.mjs'))
    expect((await runtime.completion).code).toBe(1)
    expect(runtime.output()).toContain('HISTOIRE_MCP_TOKEN')
    expect(runtime.output()).not.toContain(token)
  })

  it('rejects tampered manifest before serving', async () => {
    const manifest = resolve(fixture.artifact, 'private/manifest.json')
    const original = await readFile(manifest, 'utf8')
    try {
      await writeFile(manifest, original.replace('Portable', 'Tampered'))
      // Catalog title may not contain docs; altering canonical buildId always invalidates capture.
      const value = JSON.parse(await readFile(manifest, 'utf8'))
      value.buildId = '0'.repeat(64)
      await writeFile(manifest, JSON.stringify(value))
      const runtime = startMcpProcess([], fixture.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: token }, resolve(fixture.artifact, 'server.mjs'))
      expect((await runtime.completion).code).toBe(1)
      expect(runtime.output()).not.toContain('Histoire MCP:')
    }
    finally { await writeFile(manifest, original) }
  })

  it('distinguishes installed peer from missing Chromium executable', async () => {
    await fixture.addPlaywright()
    const browsers = resolve(fixture.root, 'empty browser cache')
    await mkdir(browsers)
    const runtime = startMcpProcess([], fixture.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: token, PLAYWRIGHT_BROWSERS_PATH: browsers }, resolve(fixture.artifact, 'server.mjs'))
    let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
    try {
      const endpoint = (await runtime.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
      client = await connectMcpHttp(endpoint, {}, token)
      expect((await callMcp(client, 'histoire_get_project')).data.capabilities.screenshots.available).toBe(true)
      const job = await callMcp(client, 'histoire_capture_screenshot', { storyId: '..', variantId: 'a:/雪', requestKey: 'missing-chromium' })
      const result = await waitMcp(() => callMcp(client!, 'histoire_get_operation', { operationId: job.data.operationId }), value => ['failed', 'completed', 'cancelled'].includes(value.data?.state))
      expect(result.data).toMatchObject({ state: 'failed', error: { code: 'BROWSER_UNAVAILABLE' } })
      expect(result.data.error.message).toContain('playwright install chromium')
    }
    finally {
      await client?.close()
      expect(await runtime.close()).toEqual({ code: 0, signal: null })
    }
  })
})
