import type { Context } from '../context.js'
import fs from 'fs-extra'
import { join } from 'pathe'
import { resolveMswWorkerPath } from '../util/resolve-msw-worker.js'

/** Writes one file to the configured build output directory. */
export async function writeFile(fileName: string, content: string, ctx: Context) {
  await fs.writeFile(join(ctx.config.outDir, fileName), content, 'utf8')
}

/**
 * Writes MSW's service worker used by static Vitest mock interception.
 *
 * Silently skipped when MSW is not installed: only mocked stories need it.
 */
export async function writeMswWorker(ctx: Context) {
  const workerPath = resolveMswWorkerPath(ctx.root)
  if (!workerPath) {
    return
  }

  await fs.copyFile(workerPath, join(ctx.config.outDir, 'mockServiceWorker.js'))
}
