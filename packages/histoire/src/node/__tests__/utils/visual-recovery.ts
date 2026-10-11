import type { HistoireVisualResult, HistoireVisualRunSummary } from '@histoire/shared'
import type { Context } from '../../context.js'
import type { VisualSource } from '../../visual/source.js'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach } from 'vitest'
import { createCanonicalCase } from '../../visual/cases.js'
import { resolveVisualConfig } from '../../visual/config.js'
import { safeVisualWrite } from '../../visual/files.js'
import { visualHash } from '../../visual/identity.js'
import { createVisualEvidence } from '../../visual/recovery.js'
import { visualCaptureSpec } from '../../visual/spec.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Real source/artifact files exercise recovery algorithms, not browser capture. */
export async function visualRecoveryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'histoire-recovery-'))
  roots.push(root)
  const ctx = { root, config: { visual: { profiles: [{ id: 'small', width: 2, height: 2 }] } }, storyFiles: ['one', 'two'].map(id => ({ relativePath: `${id}.story.vue`, path: join(root, `${id}.story.vue`), story: { id, title: id, variants: [{ id: 'default', title: 'Default' }] } })) } as Context
  await Promise.all(ctx.storyFiles.map(file => writeFile(file.path, '<template>Stable</template>')))
  const source = { ctx, isActive: () => true, server: { config: { root, publicDir: '', env: {}, define: {}, server: { fs: { allow: [root] } } }, moduleGraph: { getModulesByFile: () => new Set() } } } as unknown as VisualSource
  const config = resolveVisualConfig(ctx.config.visual)!
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  const image = PNG.sync.write(png)
  /** Detached captured inputs; outcomes are verified against real persisted pixels. */
  async function evidence(storyId: string, admittedAt: number, override?: import('@histoire/shared').HistoireVisualCase, profileId = 'small', id = randomUUID()) {
    const item = override ?? createCanonicalCase(storyId, 'default', storyId)
    const result: HistoireVisualResult = { id: visualHash(JSON.stringify([item.id, profileId])), case: item, spec: visualCaptureSpec(source, config, item, profileId), status: 'missing', images: { current: `${visualHash(JSON.stringify([item.id, profileId]))}-current.png` }, currentHash: visualHash(image), currentDimensions: { width: 2, height: 2 }, browserVersion: 'fixture', workingRevision: null }
    const run: HistoireVisualRunSummary = { id, platform: `${process.platform}-${process.arch}`, baselineSource: 'Working tree', state: 'running', total: 2, results: [result], reportPath: `.histoire/visual/runs/${id}/report.json`, htmlPath: `.histoire/visual/runs/${id}/index.html`, ok: false }
    await safeVisualWrite(root, `.histoire/visual/runs/${id}/images/${result.images.current}`, image)
    return createVisualEvidence(source, config, run, result, admittedAt)
  }
  return { root, source, config, evidence, image }
}
