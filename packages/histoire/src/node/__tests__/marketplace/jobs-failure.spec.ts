import { afterEach, expect, it } from 'vitest'
import { parseFailure, suggestVersion } from '../../marketplace/jobs/failure.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { jobManifest } from './jobs-fixture.js'

afterEach(disposeConfigProjects)

it('suggests newest release whose peer range accepts installed vite', async () => {
  const project = await configTestProject()
  const versions = Object.fromEntries([
    ['1.0.0', '^6.0.0'],
    ['1.2.0', '^6.0.0'],
    ['2.0.0', '^7.0.0'],
  ].map(([version, vite]) => [version, { name: 'test-plugin', version, peerDependencies: { vite }, histoire: { marketplace: jobManifest } }]))
  const registry = await registryServer({ packages: { 'test-plugin': { 'name': 'test-plugin', 'dist-tags': { latest: '2.0.0' }, versions } } })
  try {
    const failure = parseFailure('ERR_PNPM_PEER_DEP_ISSUES\nunmet peer vite@"^7.0.0": found 6.1.0')
    expect(failure).toMatchObject({ peer: 'vite', found: '6.1.0' })
    expect(await suggestVersion(project.root, 'test-plugin', failure, { registryUrl: registry.url })).toEqual({ version: '1.2.0', reason: 'Last version that supports vite 6' })
    expect(registry.requests.map(request => request.pathname)).toEqual(['/test-plugin'])
  }
  finally { await registry.close() }
})
