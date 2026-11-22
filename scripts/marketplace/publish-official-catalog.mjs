import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { marketplaceRequire, marketplaceSource } from './source-loader.mjs'

const { z } = marketplaceRequire('zod')
const { OFFICIAL_FEED_BYTES, parseOfficialFeed } = await marketplaceSource.import('../../packages/histoire/src/node/marketplace/catalog/official-feed.ts')
const { fetchMarketplaceJson } = await marketplaceSource.import('../../packages/histoire/src/node/marketplace/catalog/fetch-json.ts')
const { packumentSchema } = await marketplaceSource.import('../../packages/histoire/src/node/marketplace/catalog/registry-entry.ts')
const { exactVersion, packageName } = await marketplaceSource.import('../../packages/histoire/src/node/marketplace/catalog/validation.ts')

const rosterFile = new URL('./official-catalog-input.json', import.meta.url)
const catalogFile = new URL('../../docs/public/marketplace/v1/official.json', import.meta.url)
const rosterSchema = z.array(z.strictObject({
  id: packageName.refine(id => id.startsWith('@histoire/')),
  listing: exactVersion,
  versions: z.array(exactVersion).min(1).max(50),
  docsUrl: z.string().url(),
})).min(1).max(100)

/** Validate publication input before contacting the public registry. */
async function readRoster() {
  const roster = rosterSchema.parse(JSON.parse(await readFile(rosterFile, 'utf8')))
  assert.equal(new Set(roster.map(entry => entry.id)).size, roster.length, 'Duplicate official package in catalog input')
  for (const { id, listing, versions } of roster) {
    assert.ok(versions.includes(listing), `Listing release is missing from the approved versions for ${id}`)
    assert.equal(new Set(versions).size, versions.length, `Duplicate approved releases for ${id}`)
  }
  return roster
}

/** Select exact published releases, retaining neither tarball details nor executable package fields. */
async function readPackage({ id, listing, versions, docsUrl }) {
  const url = `https://registry.npmjs.org/${id.replace('/', '%2f')}`
  const raw = await fetchMarketplaceJson(url, 8 * 1024 * 1024, AbortSignal.timeout(10_000))
  assert.equal(raw.name, id, `Registry returned the wrong package for ${id}`)
  const selected = Object.fromEntries(versions.map((version) => {
    const release = raw.versions?.[version]
    assert.ok(release?.name === id && release.version === version, `Missing published release ${id}@${version}`)
    return [version, release]
  }))
  const time = Object.fromEntries(versions.flatMap(version => raw.time?.[version] ? [[version, raw.time[version]]] : []))
  const packument = packumentSchema.parse({ 'name': id, 'dist-tags': { latest: listing }, 'versions': selected, time })
  return { packument, docsUrl }
}

/** Check the serialized file exactly as Histoire will consume it, without npm access. */
function validateCatalog(bytes, roster) {
  assert.ok(Buffer.byteLength(bytes) <= OFFICIAL_FEED_BYTES, 'Official catalog exceeds its size limit')
  const feed = parseOfficialFeed(JSON.parse(bytes))
  assert.deepEqual(feed.packages.map(({ packument, docsUrl }) => ({
    id: packument.name,
    listing: packument['dist-tags'].latest,
    versions: Object.keys(packument.versions),
    docsUrl,
  })), roster, 'Official catalog does not match the reviewed input. Run pnpm marketplace:catalog.')
}

const { values } = parseArgs({ options: { check: { type: 'boolean' } } })
const roster = await readRoster()
if (values.check) {
  validateCatalog(await readFile(catalogFile, 'utf8'), roster)
}
else {
  const feed = { schemaVersion: 1, packages: await Promise.all(roster.map(readPackage)) }
  const bytes = `${JSON.stringify(feed, null, 2)}\n`
  validateCatalog(bytes, roster)
  await writeFile(catalogFile, bytes)
}
