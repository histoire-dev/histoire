import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareEmbedOutput, writeEmbedDescriptor } from '../../virtual/embed/output.js'
import { createEmbedSource } from '../../virtual/embed/source.js'
import { createEmbedSourceFixture } from '../utils/embed/source.js'

describe('enabled dev/static source projection', () => {
  let fixture: Awaited<ReturnType<typeof createEmbedSourceFixture>>
  beforeEach(async () => {
    fixture = await createEmbedSourceFixture()
  })
  afterEach(() => fixture.close())

  it('projects equivalent portable catalog without heavyweight bodies or private configuration', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    const dev = source.getDescriptor()
    const emitted = await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')
    const built = await writeEmbedDescriptor(fixture.context, emitted, fixture.root, 'immutable-build')
    expect(built.catalog).toEqual(dev.catalog)
    expect(dev.mode).toBe('dev')
    expect(built).toMatchObject({ mode: 'static', epoch: 'immutable-build', revision: 'immutable-build' })
    expect(built.capabilities.serverTests.available).toBe(false)
    const serialized = JSON.stringify(built)
    for (const privateValue of [fixture.root, 'source-body', 'lazy-doc-body', 'configFile', 'moduleId', 'onDev', 'private/', 'server.mjs']) expect(serialized).not.toContain(privateValue)
    const html = await readFile(join(fixture.root, '__embed.html'), 'utf8')
    expect(html).toContain('/nested/book/assets/bridge.js')
    expect(html).not.toContain('bundle-main')
    expect(html).not.toContain('__HST_COLLECT__')
  })

  it('emits no embedding files while disabled and keeps prior outputs untouched', async () => {
    fixture.context.config.embed = { enabled: false }
    const source = createEmbedSource(fixture.context, fixture.catalog)
    expect(await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js')).toBeUndefined()
    expect((await readdir(fixture.root)).filter(path => path.startsWith('__embed') || path.startsWith('histoire-embed'))).toEqual([])
  })

  it('preserves legacy groups with optional identities in portable publication', async () => {
    fixture.context.config.tree.groups = [{ title: 'Included stories', include: () => true }]
    await fixture.catalog.publish(fixture.context)
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    expect(descriptor.catalog.tree[0]).toMatchObject({ kind: 'group', title: 'Included stories' })
    expect(descriptor.catalog.tree[0]).not.toHaveProperty('id')
    expect(JSON.stringify(descriptor.catalog.tree)).toContain(fixture.story.story.id)
  })

  it('preserves background presets without optional contrast overrides', () => {
    fixture.context.config.backgroundPresets = [{ label: 'Brand', color: '#cafff5' }]
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    expect(descriptor.config.backgroundPresets).toEqual([{ label: 'Brand', color: '#cafff5' }])
    expect(descriptor.config.backgroundPresets[0]).not.toHaveProperty('contrastColor')
  })

  it('loads surface styles from the deployed book base without booting the explorer', async () => {
    const source = createEmbedSource(fixture.context, fixture.catalog)
    await prepareEmbedOutput(fixture.context, source, fixture.root, 'assets/bridge.js', 'assets/style.css')
    const html = await readFile(join(fixture.root, '__embed.html'), 'utf8')
    expect(html).toContain('<link rel="stylesheet" href="/nested/book/assets/style.css">')
    expect(html).not.toContain('bundle-main')
    expect(html).not.toContain('__HST_COLLECT__')
  })
})
