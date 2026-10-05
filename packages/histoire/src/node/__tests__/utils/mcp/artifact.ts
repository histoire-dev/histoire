import type { HistoireSourceDescriptor } from '@histoire/protocol'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inventoryPublicAssets, writeNodeContent } from '../../../build/node/content.js'
import { createArtifactManifest } from '../../../build/node/manifest.js'
import { captureNodeBuildInputs, createNodeBuildSnapshot } from '../../../build/node/snapshot.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from './project.js'

/** Small immutable artifact fixture, shared by production routing and auth tests. */
export async function createMcpArtifactFixture(base = '/', embed?: HistoireSourceDescriptor) {
  const fixture = await createMcpProjectFixture()
  const publicDir = join(fixture.root, 'public')
  const privateDir = join(fixture.root, 'private')
  await mkdir(publicDir)
  await mkdir(privateDir)
  const file = createMcpStory(fixture.root)
  file.story.docsText = '# Documentation\n😀\r\n'
  const context = createMcpContext(fixture.root, [file])
  context.config = { ...context.config, base, routerMode: 'history', theme: { title: 'Portable book', defaultColorScheme: 'auto' }, mcp: true } as any
  context.resolvedViteConfig.base = base
  const snapshot = await createNodeBuildSnapshot(context, await captureNodeBuildInputs(context))
  for (const [path, text] of Object.entries({ 'index.html': '<html>Book</html>', '__sandbox.html': '<html>Sandbox</html>', 'histoire.json': '{}', 'asset.js': 'export const asset = true' })) await writeFile(join(publicDir, path), text)
  if (embed) await writeFile(join(publicDir, 'histoire-embed.json'), JSON.stringify(embed))
  const manifest = createArtifactManifest(snapshot, await inventoryPublicAssets(publicDir), false, '1.2.3')
  await writeNodeContent(privateDir, snapshot.blobs)
  await writeFile(join(privateDir, 'manifest.json'), JSON.stringify(manifest))
  return { ...fixture, publicDir, privateDir, manifest }
}
