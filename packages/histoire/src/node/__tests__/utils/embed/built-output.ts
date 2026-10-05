import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSerializedStoryData } from '../../../build-serialize.js'
import { createStaticCaptureMetadata } from '../../../runtime/catalog/build-metadata.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../mcp/project.js'

/** Completed static output shared by reader and HTTP hosting behavior tests. */
export async function createEmbedBuiltOutput() {
  const fixture = await createMcpProjectFixture()
  const outputRoot = join(fixture.root, 'output')
  await mkdir(outputRoot)
  const file = createMcpStory(fixture.root, 'a:b', 'a.js', [{ id: 'c:d', title: 'Variant' }])
  const ctx = createMcpContext(fixture.root, [file])
  ctx.config = { theme: { defaultColorScheme: 'dark' }, backgroundPresets: [{ color: '#fff' }], embed: false } as any
  ctx.resolvedViteConfig.base = '/book/'
  for (const name of ['index.html', '__sandbox.html', 'asset.js']) await writeFile(join(outputRoot, name), name)
  const data = getSerializedStoryData(ctx)
  const capture = await createStaticCaptureMetadata(ctx, data, outputRoot)
  await writeFile(join(outputRoot, 'histoire.json'), JSON.stringify({ ...data, capture }))
  return { fixture, outputRoot, data, capture, ctx }
}
