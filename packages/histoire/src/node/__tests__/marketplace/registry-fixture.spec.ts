import { Buffer } from 'node:buffer'
import { expect, it, onTestFinished } from 'vitest'
import { registryServer } from '../utils/marketplace/registry-server.js'

// Real HTTP consumers rely on identical auth for metadata and binary archives.
// A JSON-encoded archive or unauthenticated route must fail these independent byte/status checks.
it('serves binary routes alongside registry metadata under the same credential policy', async () => {
  const body = new Uint8Array([0, 255, 31, 139, 10])
  const routes = new Map([['/plugin.tgz', body]])
  const registry = await registryServer({ routes, authorization: 'Bearer fixture', names: ['plugin'] })
  onTestFinished(registry.close)
  const denied = await fetch(`${registry.url}/plugin.tgz`)
  expect(denied.status).toBe(401)
  const headers = { authorization: 'Bearer fixture' }
  const archive = await fetch(`${registry.url}/plugin.tgz`, { headers })
  expect(archive.status).toBe(200)
  expect(archive.headers.get('content-type')).toBe('application/octet-stream')
  expect(Buffer.from(await archive.arrayBuffer())).toEqual(Buffer.from([0, 255, 31, 139, 10]))
  const search = await fetch(`${registry.url}/-/v1/search`, { headers })
  expect(await search.json()).toEqual({ objects: [{ package: { name: 'plugin' } }], total: 1 })
  routes.set('/second.tgz', new Uint8Array([17]))
  expect(Buffer.from(await (await fetch(`${registry.url}/second.tgz`, { headers })).arrayBuffer())).toEqual(Buffer.from([17]))
  expect(registry.requests.every(url => url.host === new URL(registry.url).host)).toBe(true)
  expect(registry.requests.map(url => url.pathname)).toEqual(['/plugin.tgz', '/plugin.tgz', '/-/v1/search', '/second.tgz'])
  expect(registry.headers.map(header => header.authorization)).toEqual([undefined, 'Bearer fixture', 'Bearer fixture', 'Bearer fixture'])
})
