import type { ClientOptions } from '@modelcontextprotocol/client'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpCliProject, MCP_BUILT_CLI } from '../../utils/mcp/cli-project.js'
import { closeMcpFixtures, createMcpProcessEnvironment } from '../../utils/mcp/process.js'

const close: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await closeMcpFixtures(close)
})

/** Poll observable lifecycle without hard-coded startup sleeps. */
async function waitForProject(client: Client) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await client.callTool({ name: 'histoire_get_project', arguments: {} })
    const data = result.structuredContent as any
    if (data.ok && ['ready', 'failed'].includes(data.data.status)) return data.data
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('MCP project did not become ready')
}

describe('built CLI stdio', () => {
  const versions: [string, ClientOptions][] = [['2026-07-28', { versionNegotiation: { mode: { pin: '2026-07-28' } } }], ['2025-11-25', {}]]
  it.each(versions)('serves %s with noisy config, root spaces and unrelated cwd', async (_version, options) => {
    const project = await createMcpCliProject()
    close.push(project.close)
    const transport = new StdioClientTransport({ command: process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, args: [MCP_BUILT_CLI, 'mcp', '--root', project.root, '--config', 'custom config.ts'], cwd: '/tmp', stderr: 'pipe', env: createMcpProcessEnvironment({ HISTOIRE_MCP_TOKEN: 'must-not-enter-config' }) as Record<string, string> })
    let stderr = ''
    transport.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-1024 * 1024)
    })
    const client = new Client({ name: 'histoire-stdio-proof', version: '1.0.0' }, options)
    const protocolErrors: Error[] = []
    client.onerror = error => protocolErrors.push(error)
    close.push(() => client.close())
    await client.connect(transport)
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['histoire_get_project', 'histoire_get_source']))
    const status = await waitForProject(client)
    expect(status.status).toBe('ready')
    expect(status.storyCount).toBe(1)
    const result = await client.callTool({ name: 'histoire_get_story', arguments: { storyId: 'stdio/a %2E..' } })
    const story = result.structuredContent as any
    expect(story.ok).toBe(true)
    const source = await client.callTool({ name: 'histoire_get_source', arguments: { storyId: 'stdio/a %2E..' } })
    expect((source.structuredContent as any).data.text).toBe(project.source)
    const resources = await client.readResource({ uri: story.data.resources.source })
    expect(resources.contents[0]).toMatchObject({ text: project.source, mimeType: 'text/plain' })
    expect(stderr).toContain('CONFIG_CONSOLE_LOG')
    expect(stderr).toContain('CONFIG_DIRECT_STDOUT')
    expect(stderr).toContain('PLUGIN_CONSOLE_LOG')
    expect(stderr).toContain('CONFIG_TOKEN=undefined')
    expect(stderr).not.toContain('must-not-enter-config')
    expect(protocolErrors).toEqual([])
    const preview = await client.callTool({ name: 'histoire_get_preview', arguments: { storyId: 'stdio/a %2E..', variantId: 'main' } })
    const previewUrl = (preview.structuredContent as any).data.storyUrl
    expect(new URL(previewUrl).hostname).toBe('127.0.0.1')
    const pid = transport.pid
    const exited = new Promise<void>((resolve) => {
      client.onclose = () => resolve()
    })
    process.kill(pid, _version === '2026-07-28' ? 'SIGINT' : 'SIGTERM')
    await exited
    expect(() => process.kill(pid, 0)).toThrow()
    await expect(fetch(previewUrl)).rejects.toThrow()
  }, 60000)

  it('observes immediate stdin EOF before worker bootstrap and exits naturally', async () => {
    const project = await createMcpCliProject()
    close.push(project.close)
    const child = spawn(process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, [MCP_BUILT_CLI, 'mcp', '--root', project.root, '--config', 'custom config.ts'], { cwd: '/tmp', env: createMcpProcessEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.resume()
    child.stderr.resume()
    const exited = new Promise<{ code: number, signal: string }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    close.push(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    })
    child.stdin.end()
    expect(await exited).toEqual({ code: 0, signal: null })
  }, 15000)

  it('exposes failed lifecycle and actionable stderr after configuration failure', async () => {
    const project = await createMcpCliProject()
    close.push(project.close)
    await writeFile(resolve(project.root, 'custom config.ts'), 'throw new Error("CONFIG_FAILURE_FOR_TEST")')
    const transport = new StdioClientTransport({ command: process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, args: [MCP_BUILT_CLI, 'mcp', '--root', project.root, '--config', 'custom config.ts'], cwd: '/tmp', stderr: 'pipe', env: createMcpProcessEnvironment() as Record<string, string> })
    let stderr = ''
    transport.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    const client = new Client({ name: 'histoire-stdio-failed', version: '1.0.0' })
    close.push(() => client.close())
    await client.connect(transport)
    expect((await waitForProject(client)).status).toBe('failed')
    const result = await client.callTool({ name: 'histoire_get_source', arguments: { storyId: 'stdio/a %2E..' } })
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: 'COLLECTION_FAILED' } })
    expect(stderr).toContain('CONFIG_FAILURE_FOR_TEST')
  }, 30000)
})
