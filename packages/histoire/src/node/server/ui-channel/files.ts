import type { UiScreenshotFile } from '@histoire/shared'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, join } from 'pathe'
import { isUiChannelEventWithinBudget, UI_CHANNEL_BYTES } from './validation.js'

/** Ensure each generated directory remains inside the real project root. */
async function screenshotsDirectory(root: string, create: boolean) {
  let directory = await realpath(root)
  for (const segment of ['.histoire', 'screenshots']) {
    directory = join(directory, segment)
    let entry = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!entry && create) {
      await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
      entry = await lstat(directory)
    }
    if (!entry) return undefined
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Screenshots directory cannot be a symlink or file')
  }
  return directory
}

/** IDs are labels only; filenames never preserve separators or dot traversal. */
function filenamePart(value: string) {
  return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'frame'
}

/** Builds generated names from safe filename fragments and an opaque capture suffix. */
function screenshotFileName(target: Pick<UiScreenshotFile, 'storyId' | 'variantId'>, format: 'png' | 'webp', suffix: string) {
  return `${filenamePart(target.storyId)}--${filenamePart(target.variantId)}--${suffix}.${format}`
}

/** Upper-bound a persisted receipt path without shortening any public identity. */
export function screenshotFilePathForBudget(target: Pick<UiScreenshotFile, 'storyId' | 'variantId'>, format: 'png' | 'webp'): string {
  return `.histoire/screenshots/${screenshotFileName(target, format, '9999999999999-00000000-0000-0000-0000-000000000000')}`
}

/** Create an exclusive image plus bounded identity metadata for recent captures. */
export async function saveScreenshotFile(root: string, target: { storyId: string, variantId: string, frameKey?: string }, format: 'png' | 'webp', artifact: Uint8Array): Promise<UiScreenshotFile> {
  const directory = (await screenshotsDirectory(root, true))!
  const name = screenshotFileName(target, format, `${Date.now()}-${randomUUID()}`)
  const file = { path: `.histoire/screenshots/${name}`, storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}) }
  await writeFile(join(directory, name), artifact, { flag: 'wx' })
  await writeFile(join(directory, `${name}.json`), JSON.stringify(file), { flag: 'wx' })
  return file
}

/** Read only generated, bounded metadata and regular images, never arbitrary files. */
export async function listScreenshotFiles(root: string, requestId = ''): Promise<UiScreenshotFile[]> {
  const directory = await screenshotsDirectory(root, false)
  if (!directory) return []
  const entries = (await readdir(directory)).filter(name => /\.(?:png|webp)\.json$/.test(name)).sort((left, right) => Number(right.match(/--(\d+)-[a-f0-9-]{36}\.(?:png|webp)\.json$/i)?.[1] ?? 0) - Number(left.match(/--(\d+)-[a-f0-9-]{36}\.(?:png|webp)\.json$/i)?.[1] ?? 0)).slice(0, 100)
  const files: UiScreenshotFile[] = []
  for (const name of entries) {
    try {
      const metadata = await lstat(join(directory, name))
      if (!metadata.isFile() || metadata.size > UI_CHANNEL_BYTES) continue
      const value = JSON.parse(await readFile(join(directory, name), 'utf8')) as UiScreenshotFile
      const imageName = name.slice(0, -5)
      if (value.path !== `.histoire/screenshots/${imageName}` || basename(value.path) !== imageName || typeof value.storyId !== 'string' || !value.storyId || value.storyId.length > 4096 || typeof value.variantId !== 'string' || !value.variantId || value.variantId.length > 4096 || (value.frameKey !== undefined && (typeof value.frameKey !== 'string' || !value.frameKey || value.frameKey.length > UI_CHANNEL_BYTES))) continue
      if (!(await lstat(join(directory, imageName))).isFile()) continue
      const file = { path: value.path, storyId: value.storyId, variantId: value.variantId, ...(value.frameKey ? { frameKey: value.frameKey } : {}) }
      // The client correlation ID can expand during JSON escaping. Retain exact
      // rows only when Vite's complete custom event still fits its byte ceiling.
      if (isUiChannelEventWithinBudget('histoire:ui:screenshot-list-result', { requestId, files: [...files, file] })) files.push(file)
    }
    catch { /* Incomplete or externally edited sidecars cannot expose paths. */ }
  }
  return files.slice(0, 20)
}

/** Serve only generated image filenames from the checked directory to dev thumbnails. */
export async function readScreenshotFile(root: string, name: string) {
  if (!/^[\w-]{1,72}--[\w-]{1,72}--\d+-[a-f0-9-]{36}\.(?:png|webp)$/i.test(name)) return undefined
  const directory = await screenshotsDirectory(root, false)
  if (!directory) return undefined
  const path = join(directory, name)
  const entry = await lstat(path).catch(() => undefined)
  if (!entry?.isFile() || entry.size > 4 * 1024 * 1024) return undefined
  return { bytes: await readFile(path), mimeType: name.endsWith('.png') ? 'image/png' : 'image/webp' }
}
