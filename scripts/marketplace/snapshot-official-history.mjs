import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Resolve existing Node tooling from its owning package; never load plugin modules. */
const require = createRequire(new URL('../../packages/histoire/package.json', import.meta.url))
/** Existing source validator works without a rebuilt dist. */
const { createJiti } = require('jiti')
/** Source imports are transformed independently of the release workspace being inspected. */
const jiti = createJiti(import.meta.url)
/** Shared validator enforces the same field limits as registry metadata. */
const { validateMarketplaceManifest } = await jiti.import('../../packages/histoire/src/node/marketplace/manifest/index.ts')
/** Exact install targets use the planner's existing syntax and length bound. */
const { exactVersion } = await jiti.import('../../packages/histoire/src/node/marketplace/changes/validation.ts')
/** npm ordering and semantic validation, shared with catalog version evaluation. */
const { compare, valid } = require('semver')

/** Fixed first-party allowlist; registry manifests cannot add official entries. */
export const officialPluginNames = ['a11y', 'designs', 'screenshot', 'percy', 'vue-devtools', 'nuxt', 'quasar', 'vue', 'react', 'svelte']
/** Repository root used by normal release commands. */
export const officialRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Report dropped metadata with its source file and precise field path. */
export function validateOfficialManifest(input, source, report = console.warn) {
  const result = validateMarketplaceManifest(input)
  for (const diagnostic of result.diagnostics) report(`${source}: ${diagnostic.path}: ${diagnostic.message}`)
  if (!result.manifest) throw new Error(`Invalid official manifest: ${source}`)
  return result.manifest
}

/** Validate version-scoped fields using the existing manifest validator, without inheriting current release data. */
function historyEntry(input, manifest, source, report) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !exactVersion.safeParse(input.version).success || !valid(input.version)) {
    report(`${source}.version: Expected an exact version`)
    return
  }
  // Only identity/config fields come from current metadata. Missing history fields stay absent.
  const fields = validateOfficialManifest({
    displayName: manifest.displayName,
    summary: manifest.summary,
    category: manifest.category,
    monogram: manifest.monogram,
    tint: manifest.tint,
    config: { import: manifest.config.import },
    requires: input.requires,
    frameworks: input.frameworks,
    releaseNotes: input.releaseNotes,
    migrations: input.migrations,
  }, source, report)
  const entry = { version: input.version, requires: fields.requires ?? {}, frameworks: fields.frameworks ?? [] }
  if (fields.releaseNotes !== undefined) entry.releaseNotes = fields.releaseNotes
  if (fields.migrations !== undefined) entry.migrations = fields.migrations
  if (input.publishedAt !== undefined) {
    if (typeof input.publishedAt === 'string' && input.publishedAt.length <= 500 && Number.isFinite(Date.parse(input.publishedAt))) entry.publishedAt = input.publishedAt
    else report(`${source}.publishedAt: Expected a publication date`)
  }
  return entry
}

/** Recover valid unique releases, sort newest first, and enforce the bundled 50-version bound. */
export function validateOfficialHistory(input, manifest, source, report = console.warn) {
  if (!Array.isArray(input)) throw new Error(`Expected official history array: ${source}`)
  const releases = new Map()
  for (const [index, value] of input.entries()) {
    const entry = historyEntry(value, manifest, `${source}.${index}`, report)
    if (!entry) continue
    if (releases.has(entry.version)) report(`${source}.${index}.version: Duplicate release dropped`)
    else releases.set(entry.version, entry)
  }
  if (releases.size > 50) report(`${source}: Retaining only the 50 newest versions`)
  return [...releases.values()].sort((a, b) => compare(b.version, a.version)).slice(0, 50)
}

/** Load committed history; missing files are allowed only while taking the first snapshot. */
export async function readOfficialHistory(directory, manifest, allowMissing = false) {
  const source = resolve(directory, 'marketplace-history.json')
  try {
    return validateOfficialHistory(JSON.parse(await readFile(source, 'utf8')), manifest, source)
  }
  catch (error) {
    if (allowMissing && error.code === 'ENOENT') return []
    throw error
  }
}

/** Commit the current declarative release once; reruns preserve the exact existing snapshot bytes. */
export async function snapshotOfficialHistory(root = officialRoot) {
  for (const plugin of officialPluginNames) {
    const directory = resolve(root, `packages/histoire-plugin-${plugin}`)
    const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
    if (pkg.name !== `@histoire/plugin-${plugin}`) throw new Error(`Invalid official package identity: ${plugin}`)
    const manifest = validateOfficialManifest(pkg.histoire?.marketplace, resolve(directory, 'package.json'))
    const history = await readOfficialHistory(directory, manifest, true)
    // Existing releases are immutable: a same-version manifest edit cannot rewrite release history.
    if (!history.some(entry => entry.version === pkg.version)) history.push({ ...manifest, version: pkg.version })
    const target = resolve(directory, 'marketplace-history.json')
    const entries = validateOfficialHistory(history, manifest, target)
    if (!entries.some(entry => entry.version === pkg.version)) throw new Error(`Current official release missing from history: ${plugin}`)
    const bytes = `${JSON.stringify(entries, null, 2)}\n`
    let before
    try {
      before = await readFile(target, 'utf8')
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (bytes !== before) await writeFile(target, bytes)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await snapshotOfficialHistory(process.argv[2] ? resolve(process.argv[2]) : officialRoot)
}
