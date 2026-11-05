import type { RegistryPackument } from '../../../marketplace/catalog/registry-entry.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { c as archive } from 'tar'
import { configTestProject } from '../../utils/config-codemod.js'
import { registryServer } from '../../utils/marketplace/registry-server.js'
import { jobManifest } from '../jobs-fixture.js'

/** Package identity shared by real archives and all marketplace requests. */
export const pluginId = 'histoire-plugin-interop'
/** Fixture credential deliberately distinct from user credentials. */
export const registryToken = 'interop-local-token-21'

/** Build local npm archives and reuse existing packument/search server semantics. */
export async function interopRegistry(authenticated = false) {
  const { root } = await configTestProject()
  const tarballs = new Map<string, Buffer>()
  const tarballRequests: Array<{ /** Actual loopback URL. */ url: URL, /** Observed credential. */ authorization?: string }> = []
  const authorization = authenticated ? `Bearer ${registryToken}` : undefined
  const server = createServer((request, response) => {
    const url = new URL(request.url!, `http://${request.headers.host}`)
    tarballRequests.push({ url, authorization: request.headers.authorization })
    if (authorization && request.headers.authorization !== authorization) {
      response.writeHead(401)
      return response.end('Authentication required')
    }
    const body = tarballs.get(url.pathname)
    response.writeHead(body ? 200 : 404, { 'content-type': 'application/octet-stream' })
    response.end(body)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  /** Release sockets even when archive generation or project setup fails. */
  async function closeTarballs() {
    server.closeAllConnections()
    const closed = once(server, 'close')
    server.close()
    await closed
  }
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing tarball address')
    const tarballUrl = `http://127.0.0.1:${address.port}`
    const packages: Record<string, RegistryPackument> = {}
    // All dependency/peer resolutions are satisfiable locally. Conflict version
    // requires Vite 7 while projects deliberately retain their direct Vite 6.
    for (const [name, version, source, peer] of [
      [pluginId, '1.0.0', 'plugin', '^6'],
      [pluginId, '2.0.0', 'plugin', '^6'],
      [pluginId, '2.1.0', 'invalid', '^6'],
      [pluginId, '3.0.0', 'plugin', '^7'],
      ['vite', '6.1.0', 'peer', ''],
      ['vite', '7.0.0', 'peer', ''],
    ]) {
      const manifest = { ...jobManifest, ...(version.startsWith('2.') ? { migrations: [{ from: '<2', ops: [{ op: 'rename-option', from: 'old', to: 'new' }] }] } : {}) }
      const pkg = { name, version, main: 'index.cjs', ...(version === '2.1.0' ? { deprecated: 'Invalid plugin identity' } : {}), ...(peer ? { peerDependencies: { vite: peer }, histoire: { marketplace: manifest } } : {}) }
      const directory = join(root, `${name}-${version}`)
      await mkdir(directory)
      await writeFile(join(directory, 'package.json'), JSON.stringify(pkg))
      await writeFile(join(directory, 'index.cjs'), await readFile(fileURLToPath(new URL(`./fixtures/${source}.cjs`, import.meta.url))))
      const chunks: Buffer[] = []
      for await (const chunk of archive({ cwd: directory, gzip: true, portable: true, prefix: 'package' }, ['package.json', 'index.cjs'])) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks)
      const pathname = `/${name}-${version}.tgz`
      tarballs.set(pathname, body)
      packages[name] ??= { name, 'dist-tags': { latest: name === pluginId ? '3.0.0' : '7.0.0' }, 'versions': {} }
      packages[name].versions[version] = { ...pkg, dist: { tarball: `${tarballUrl}${pathname}`, integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`, shasum: createHash('sha1').update(body).digest('hex') } }
    }
    const metadata = await registryServer({ packages, authorization })
    return { ...metadata, tarballUrl, tarballRequests,
      /** Close both loopback services; scratch files use existing project cleanup. */
      async close() { await Promise.all([metadata.close(), closeTarballs()]) } }
  }
  catch (error) {
    await closeTarballs()
    throw error
  }
}
