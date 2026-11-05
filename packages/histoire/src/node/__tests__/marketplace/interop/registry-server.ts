import type { RegistryPackument } from '../../../marketplace/catalog/registry-entry.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
  const authorization = authenticated ? `Bearer ${registryToken}` : undefined
  const packages: Record<string, RegistryPackument> = {}
  const registry = await registryServer({ packages, authorization, routes: tarballs })
  try {
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
      packages[name].versions[version] = { ...pkg, dist: { tarball: `${registry.url}${pathname}`, integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`, shasum: createHash('sha1').update(body).digest('hex') } }
    }
    return { ...registry,
      /** Binary observations use the shared server's actual request/header pairs. */
      get tarballRequests() {
        return registry.requests.flatMap((url, index) => tarballs.has(url.pathname) ? [{ url, authorization: registry.headers[index].authorization }] : [])
      } }
  }
  catch (error) {
    await registry.close()
    throw error
  }
}
