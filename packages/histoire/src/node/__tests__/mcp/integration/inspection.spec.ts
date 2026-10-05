import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { getProjectServices } from 'histoire/dist/node/api/internal.js'
import { getMcpObserver } from 'histoire/dist/node/mcp/observer/context.js'
import { createHistoireProject } from 'histoire/node'
import { describe, expect, it } from 'vitest'
import { copyMcpArtifact } from '../../utils/mcp/artifact-project.js'
import { MCP_BUILT_CLI } from '../../utils/mcp/cli-project.js'
import { createMcpInspectionProject } from '../../utils/mcp/inspection-project.js'
import { assertMcpProcessReleased, callMcp, connectMcpHttp, createMcpProcessEnvironment, startMcpProcess, waitMcp } from '../../utils/mcp/process.js'

/** Exercise public tools rather than bypassing admission with direct browser scripts. */
async function inspect(client: Awaited<ReturnType<typeof connectMcpHttp>>, name: string, requestKey: string, extra: Record<string, unknown> = {}) {
  await waitMcp(() => callMcp(client, 'histoire_get_project'), value => value.data?.status === 'ready' && !value.data.updating)
  const started = await callMcp(client, name, { storyId: 'deterministic', variantId: 'normal', requestKey, ...extra })
  expect(started.ok, JSON.stringify(started)).toBe(true)
  const terminal = await waitMcp(() => callMcp(client, 'histoire_get_operation', { operationId: started.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state))
  expect(terminal.data, JSON.stringify(terminal.data?.error)).toMatchObject({ state: 'completed' })
  return terminal.data.result
}

/** Same observed behavior must survive removal of the original project. */
async function verify(client: Awaited<ReturnType<typeof connectMcpHttp>>, prefix: string) {
  const variant = await inspect(client, 'histoire_inspect_variant', `${prefix}-variant`)
  expect(variant).toMatchObject({ inspection: 'variant', propsAvailable: true, state: { count: 3, nested: { enabled: true } } })
  expect(variant.state).not.toHaveProperty('computed')
  const button = variant.components.find(component => component.name === 'InspectButton')
  expect(button.props.find(prop => prop.name === 'label')).toMatchObject({ types: ['string'], default: 'Save', value: 'Save' })
  const dom = await inspect(client, 'histoire_inspect_dom', `${prefix}-dom`, { selector: '#inspection-root', maxNodes: 20 })
  expect(dom.nodes.find(node => node.tag === 'button')).toMatchObject({ attributes: { 'aria-label': 'Save' } })
  expect(dom.nodes.find(node => node.tag === 'button').rect.width).toBeGreaterThan(0)
  expect(JSON.stringify(dom)).not.toContain('private-password')
  const accessibility = await inspect(client, 'histoire_inspect_accessibility', `${prefix}-aria`, { selector: '#inspection-root' })
  expect(accessibility.snapshot).toContain('button "Save"')
  expect(accessibility.snapshot).toContain('textbox "Name"')
  const diagnostics = await inspect(client, 'histoire_get_runtime_diagnostics', `${prefix}-diagnostics`)
  expect(diagnostics.entries).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'console', message: 'inspection fixture warning' })]))
  expect(diagnostics.entries).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'http-error', status: 404, url: expect.stringMatching(/\/inspection-missing\.json$/) })]))
  expect(JSON.stringify(diagnostics)).not.toContain('token=hidden')
  const limited = await inspect(client, 'histoire_inspect_dom', `${prefix}-limited`, { selector: '#inspection-root', maxNodes: 1 })
  expect(limited).toMatchObject({ truncated: true, nodes: [{ tag: 'section' }] })
  const missing = await inspect(client, 'histoire_inspect_dom', `${prefix}-missing`, { selector: '#missing' })
  expect(missing).toMatchObject({ matched: false, nodes: [] })
  const invalid = await callMcp(client, 'histoire_inspect_dom', { storyId: 'deterministic', variantId: 'normal', requestKey: `${prefix}-invalid`, selector: '[' })
  const rejected = await waitMcp(() => callMcp(client, 'histoire_get_operation', { operationId: invalid.data.operationId }), value => value.data?.state === 'failed')
  expect(rejected.data.error.code).toBe('INVALID_SELECTOR')
}

describe('real MCP inspection in dev and portable Node', () => {
  it('inspects rendered state, DOM, ARIA and diagnostics through dev HTTP and copied artifact', async () => {
    const fixture = await createMcpInspectionProject()
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom config.ts' })
    let portable: Awaited<ReturnType<typeof copyMcpArtifact>> | undefined
    let deployed: ReturnType<typeof startMcpProcess> | undefined
    let client: Awaited<ReturnType<typeof connectMcpHttp>> | undefined
    try {
      const handle = await project.startDev({ host: '127.0.0.1', port: 0 })
      await handle.ready
      const endpoint = getMcpObserver(getProjectServices(project).dev!.controller.current!.context)!.snapshot().endpoint!
      client = await connectMcpHttp(endpoint)
      await verify(client, 'dev')
      await client.close()
      client = undefined
      await handle.close()
      await project.build()
      portable = await copyMcpArtifact(fixture.root)
      await portable.addPlaywright()
      await fixture.close()
      deployed = startMcpProcess([], portable.unrelated, { HOST: '127.0.0.1', PORT: '0', HISTOIRE_MCP_TOKEN: 'ed'.repeat(32) }, resolve(portable.artifact, 'server.mjs'))
      const url = (await deployed.waitFor(/Histoire MCP: (http:\/\/\S+)/))[1]
      client = await connectMcpHttp(url, {}, 'ed'.repeat(32))
      await verify(client, 'node')
    }
    finally {
      await client?.close()
      await deployed?.close()
      await project.close()
      await portable?.close()
      await fixture.close()
    }
  }, 180_000)

  it('inspects all four kinds through owned stdio worker and releases its listener', async () => {
    const fixture = await createMcpInspectionProject()
    const transport = new StdioClientTransport({ command: process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, args: [MCP_BUILT_CLI, 'mcp', '--root', fixture.root, '--config', 'custom config.ts'], cwd: '/tmp', stderr: 'pipe', env: createMcpProcessEnvironment() as Record<string, string> })
    transport.stderr.resume()
    const client = new Client({ name: 'histoire-stdio-inspection', version: '1' })
    try {
      await client.connect(transport)
      expect((await client.listTools()).tools).toHaveLength(14)
      await verify(client, 'stdio')
      const preview = await callMcp(client, 'histoire_get_preview', { storyId: 'deterministic', variantId: 'normal' })
      const pid = transport.pid
      await client.close()
      await assertMcpProcessReleased({ pid }, preview.data.storyUrl)
    }
    finally {
      await client.close()
      await fixture.close()
    }
  }, 120_000)
})
