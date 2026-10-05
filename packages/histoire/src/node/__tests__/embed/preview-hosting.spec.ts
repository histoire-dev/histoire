import { cp, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedBuiltOutput } from '../utils/embed/built-output.js'
import { createEmbedDescriptor } from '../utils/embed/catalog.js'
import { flushMicrotasks } from '../utils/flush.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

const { createHistoireProject } = await import('../../../../dist/node/api/index.js')
const { getProjectServices } = await import('../../../../dist/node/api/internal.js')

/** Uses configured output without linking original source project or collecting stories. */
async function configurePreview(root: string, outDir: string) {
  await writeFile(join(root, 'histoire.config.ts'), `export default {outDir:${JSON.stringify(outDir)},storyMatch:[],mcp:false}`)
  await writeFile(join(root, 'vite.config.ts'), `export default {base:'/book/'}`)
  return createHistoireProject({ root })
}

describe('immutable Node preview hosting', () => {
  it('joins pending preview acquisition and late listener cleanup when project closes', async () => {
    const output = await createEmbedBuiltOutput()
    const project = await configurePreview(output.fixture.root, 'output')
    const started = join(output.fixture.root, 'preview-started')
    const release = join(output.fixture.root, 'preview-release')
    await writeFile(join(output.fixture.root, 'histoire.config.ts'), `
      import { access, writeFile } from 'node:fs/promises';
      export default {outDir:'output',storyMatch:[],mcp:false,plugins:[{
        name:'pending-preview',async onPreview(){
          await writeFile(${JSON.stringify(started)},'started');
          while(true){try{await access(${JSON.stringify(release)});break}catch{await new Promise(resolve=>setTimeout(resolve,5))}}
        }
      }]};
    `)
    try {
      const acquisition = project.preview({ port: 0, host: '127.0.0.1' })
      const rejected = expect(acquisition).rejects.toMatchObject({ code: 'DISPOSED' })
      await vi.waitFor(async () => expect(await readFile(started, 'utf8')).toBe('started'))
      let closed = false
      const closing = project.close().then(() => {
        closed = true
      })
      await flushMicrotasks()
      expect(closed).toBe(false)
      await writeFile(release, 'release')
      await closing
      expect(getProjectServices(project).preview).toBeUndefined()
      await rejected
    }
    finally {
      await writeFile(release, 'release')
      await project.close()
      await output.fixture.close()
    }
  })

  it('serves copied built output and nonce documents before SPA fallback; drains old capture ownership', async () => {
    const original = await createEmbedBuiltOutput()
    const copied = await createMcpProjectFixture()
    await cp(original.outputRoot, join(copied.root, 'output'), { recursive: true })
    await original.fixture.close()
    const project = await configurePreview(copied.root, 'output')
    try {
      const handle = await project.preview({ host: '127.0.0.1', port: 0 })
      await handle.ready
      await expect(project.preview({ port: 0 })).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
      expect(handle.capture.available).toBe(true)
      expect((await fetch(handle.url)).status).toBe(200)
      const old = getProjectServices(project).preview.current
      expect(old.snapshot.getTarget('a:b', 'c:d').variant.id).toBe('c:d')
      const lease = old.registry.open({ origin: old.origin, storyId: 'a:b', variantId: 'c:d', epoch: old.epoch, width: 720, height: 560, backgroundColor: 'transparent', textDirection: 'ltr', isActive: old.isActive })
      expect(await (await fetch(lease.url)).text()).toContain('mcpNonce')
      lease.close()
      expect((await fetch(lease.url)).status).toBe(404)
      expect((await fetch(`${handle.url}__histoire/preview/unknown.html`)).status).toBe(404)
      const neverSettled = deferred<void>()
      const cleanup = deferred<void>()
      const capture = old.execution.enqueue({ run: (signal) => {
        signal.addEventListener('abort', () => neverSettled.resolve(), { once: true })
        return neverSettled.promise
      }, cleanup: () => cleanup.promise })
      await flushMicrotasks()
      const restarting = handle.restart()
      expect(old.isActive()).toBe(false)
      await flushMicrotasks()
      expect((await fetch(handle.url)).status).toBe(503)
      cleanup.resolve()
      await restarting
      await expect(capture.result).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(getProjectServices(project).preview.current.epoch).not.toBe(old.epoch)
      const previous = await readFile(join(copied.root, 'output', 'index.html'), 'utf8')
      await expect(project.build()).rejects.toThrow('active preview')
      expect(await readFile(join(copied.root, 'output', 'index.html'), 'utf8')).toBe(previous)
      await handle.close()
      expect(getProjectServices(project).preview).toBeUndefined()
    }
    finally {
      await project.close()
      await copied.close()
    }
  }, 30_000)

  it('keeps legacy output browsable with capture unavailable and no development source scan', async () => {
    const output = await createEmbedBuiltOutput()
    await writeFile(join(output.outputRoot, 'histoire.json'), JSON.stringify(output.data))
    const project = await configurePreview(output.fixture.root, 'output')
    try {
      const handle = await project.preview({ port: 0, host: '127.0.0.1' })
      expect(handle.capture).toMatchObject({ available: false, reason: 'CAPABILITY_UNAVAILABLE' })
      expect((await fetch(handle.url)).status).toBe(200)
      expect(getProjectServices(project).dev).toBeUndefined()
      expect(getProjectServices(project).preview.current.snapshot.catalog.stories[0].id).toBe('a:b')
      await handle.close()
    }
    finally {
      await project.close()
      await output.fixture.close()
    }
  })

  it('serves only validated Node public assets without production MCP startup', async () => {
    const descriptor = createEmbedDescriptor()
    descriptor.embed = { allowedOrigins: ['https://baked.example'], allowOpenInEditor: false, allowServerTests: false }
    const artifact = await createMcpArtifactFixture('/node/', descriptor)
    const project = await configurePreview(artifact.root, '.')
    try {
      const handle = await project.preview({ port: 0, host: '127.0.0.1' })
      expect(handle.url.endsWith('/node/')).toBe(true)
      expect(handle.capture.available).toBe(true)
      const policyResponse = await fetch(`${handle.url}histoire-embed-origins.json`)
      expect(await policyResponse.json()).toEqual({ version: 1, allowedOrigins: ['https://baked.example'] })
      expect(policyResponse.headers.get('content-security-policy')).toContain('https://baked.example')
      vi.stubEnv('HISTOIRE_EMBED_ORIGINS', 'https://override.example')
      await handle.restart()
      const overridden = await fetch(`${handle.url}histoire-embed-origins.json`)
      expect(await overridden.json()).toEqual({ version: 1, allowedOrigins: ['https://override.example'] })
      expect(overridden.headers.get('content-security-policy')).toContain('https://override.example')
      expect(overridden.headers.get('content-security-policy')).not.toContain('https://baked.example')
      const privateResponse = await fetch(`${handle.url}private/manifest.json`)
      expect(await privateResponse.text()).not.toContain(artifact.manifest.buildId)
      const publicAsset = join(artifact.publicDir, 'asset.js')
      await unlink(publicAsset)
      await symlink(join(artifact.privateDir, 'manifest.json'), publicAsset)
      const swapped = await fetch(`${handle.url}asset.js`)
      expect(swapped.status).toBe(503)
      expect(await swapped.text()).not.toContain(artifact.manifest.buildId)
      await unlink(publicAsset)
      await writeFile(publicAsset, 'unverified changed public content')
      const modified = await fetch(`${handle.url}asset.js`)
      expect(modified.status).toBe(503)
      expect(await modified.text()).not.toContain('unverified changed public content')
      expect(getProjectServices(project).dev).toBeUndefined()
      await handle.close()
    }
    finally {
      vi.unstubAllEnvs()
      await project.close()
      await artifact.close()
    }
  })
})
