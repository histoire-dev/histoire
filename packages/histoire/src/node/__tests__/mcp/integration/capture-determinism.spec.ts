import type { PreviewHostRegistry, PreviewHostTarget } from 'histoire/dist/node/runtime/browser/preview-host.js'
import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getProjectServices } from 'histoire/dist/node/api/internal.js'
import { createScreenshotTask } from 'histoire/dist/node/runtime/browser/screenshot.js'
import { createPreviewSession } from 'histoire/dist/node/runtime/browser/session.js'
import { getDevPreviewHost } from 'histoire/dist/node/vite/mcp-preview-html.js'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { copyMcpArtifact } from '../../utils/mcp/artifact-project.js'
import { createMcpCaptureProject } from '../../utils/mcp/capture-project.js'
import { callMcp, connectMcpHttp, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

/** Fixed internal inspection proves settings rendered before retaining pixels. */
async function inspect(root: string, host: PreviewHostRegistry, target: PreviewHostTarget) {
  const session = createPreviewSession({ root, host, target, deterministicCapture: true })
  try {
    const ready = await session.open(new AbortController().signal)
    return (await ready.frame.locator('[data-capture-label]').textContent())?.trim()
  }
  finally { await session.close() }
}

describe('deterministic real Chromium capture', () => {
  it('captures animated story with UTC, DPR, globals and copied Node artifact', async () => {
    const fixture = await createMcpCaptureProject()
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    let portable: Awaited<ReturnType<typeof copyMcpArtifact>> | undefined
    let deployed: ReturnType<typeof startMcpProcess> | undefined
    let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
    try {
      const handle = await project.startDev({ host: '127.0.0.1', port: 0 })
      await handle.ready
      const dev = getProjectServices(project).dev!
      const runtime = dev.controller.current!
      const host = getDevPreviewHost(runtime.server)
      const target = { origin: new URL(handle.url).origin, storyId: 'deterministic', variantId: 'normal', epoch: runtime.epoch, width: 480, height: 320, deviceScaleFactor: 1, globals: { theme: 'contrast' }, backgroundColor: '#fff', textDirection: 'ltr' as const, isActive: runtime.isActive }
      expect(await inspect(fixture.root, host, target)).toBe('UTC|en-US|0|contrast')
      const first = await dev.execution.enqueue(createScreenshotTask({ root: fixture.root, host, target })).result
      const second = await dev.execution.enqueue(createScreenshotTask({ root: fixture.root, host, target })).result
      expect(first.result.sha256).toBe(second.result.sha256)
      const scaled = await dev.execution.enqueue(createScreenshotTask({ root: fixture.root, host, target: { ...target, deviceScaleFactor: 2 } })).result
      expect(scaled.result).toMatchObject({ width: 960, height: 640 })
      const maximum = await dev.execution.enqueue(createScreenshotTask({ root: fixture.root, host, target: { ...target, width: 3840, height: 2160, deviceScaleFactor: 3 } })).result
      expect(maximum.result).toMatchObject({ width: 11520, height: 6480 })
      expect(maximum.result.bytes).toBeLessThanOrEqual(4 * 1024 * 1024)
      const defaultCapture = await dev.execution.enqueue(createScreenshotTask({ root: fixture.root, host, target: { ...target, globals: { theme: 'default' } } })).result
      expect(defaultCapture.result.sha256).not.toBe(first.result.sha256)
      await handle.close()
      await project.build()
      portable = await copyMcpArtifact(fixture.root)
      await portable.addPlaywright()
      await fixture.close()
      const manifest = JSON.parse(await readFile(resolve(portable.artifact, 'private/manifest.json'), 'utf8'))
      expect(manifest).toMatchObject({ base: '/book/', textDirection: 'rtl', globals: { theme: 'default' } })
      deployed = startMcpProcess([], portable.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: 'ca'.repeat(32) }, resolve(portable.artifact, 'server.mjs'))
      const endpoint = (await deployed.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
      client = await connectMcpHttp(endpoint, {}, 'ca'.repeat(32))
      const captures = []
      for (const theme of ['contrast', 'default']) {
        const started = await callMcp(client, 'histoire_capture_screenshot', { storyId: 'deterministic', variantId: 'normal', requestKey: theme, width: 480, height: 320, deviceScaleFactor: 2, globals: { theme } })
        expect(started.ok).toBe(true)
        const result = await waitMcp(() => callMcp(client!, 'histoire_get_operation', { operationId: started.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
        expect(result.data, JSON.stringify(result.data.error)).toMatchObject({ state: 'completed', result: { width: 960, height: 640 } })
        const resource = await client.readResource({ uri: result.data.result.artifactUri })
        const png = Buffer.from((resource.contents[0] as any).blob, 'base64')
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([960, 640])
        captures.push(result.data.result.sha256)
      }
      expect(captures[0]).not.toBe(captures[1])
      if (process.env.HISTOIRE_MCP_CAPTURE_EVIDENCE) {
        await writeFile(process.env.HISTOIRE_MCP_CAPTURE_EVIDENCE, JSON.stringify({ deterministicSha256: first.result.sha256, dimensions: [[480, 320], [scaled.result.width, scaled.result.height], [maximum.result.width, maximum.result.height]], maximumBytes: maximum.result.bytes, copiedGlobalsHashes: captures }, null, 2))
      }
    }
    finally {
      await client?.close()
      await deployed?.close()
      await project.close()
      await portable?.close()
      await fixture.close()
    }
  }, 180_000)
})
