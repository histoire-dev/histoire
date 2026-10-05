import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MCP_REPOSITORY_ROOT } from '../../utils/mcp/cli-project.js'
import { createMcpProjectFixture } from '../../utils/mcp/project.js'
import { fixturePackageVersion, packConsumerPackage, runPackageCommand } from '../../utils/package-consumer.js'

it('ships Nuxt runtime files and peer range independently of runtime consumer installation', async () => {
  const fixture = await createMcpProjectFixture()
  try {
    const packed = await packConsumerPackage(join(MCP_REPOSITORY_ROOT, 'packages/histoire-plugin-nuxt'), join(fixture.root, 'nuxt-tarball'))
    const require = createRequire(await realpath(join(MCP_REPOSITORY_ROOT, 'packages/histoire-plugin-nuxt/node_modules/@nuxt/kit/package.json')))
    const { satisfies } = require('semver')
    const peer = packed.manifest.peerDependencies.nuxt
    for (const example of ['nuxt4', 'nuxt-ui']) expect(satisfies(await fixturePackageVersion('nuxt', example), peer), `${example} installed version`).toBe(true)
    // Nuxt3 proves declared range compatibility only: no installed Nuxt3 runtime fixture exists here.
    expect(satisfies('3.0.0', peer)).toBe(true)
    expect(satisfies('5.0.0', peer)).toBe(false)
    expect(JSON.stringify(packed.manifest)).not.toContain('workspace:')
    for (const path of ['runtime/composables.mjs', 'dist/runtime/app-setup.js', 'dist/runtime/nuxt-lifecycle.js']) expect(packed.inventory).toContain(`package/${path}`)
    const shim = (await runPackageCommand('tar', ['-xOzf', packed.tarball, 'package/runtime/composables.mjs'], fixture.root)).stdout
    expect(shim).toContain('from \'#app/nuxt\'')
  }
  finally { await fixture.close() }
})
