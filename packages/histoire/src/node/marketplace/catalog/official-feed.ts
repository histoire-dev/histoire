import type { RegistryRelease } from './registry-entry.js'
import { valid } from 'semver'
import { z } from 'zod'
import { webUrl } from '../../config/plugin-metadata.js'
import { officialPlugins } from './official.js'
import { packumentSchema, registryRelease } from './registry-entry.js'
import { exactVersion } from './validation.js'
import { compareVersions } from './version.js'

/** Versioned public catalog URL. Only test callers can substitute another origin. */
export const OFFICIAL_FEED_URL = 'https://histoire.dev/marketplace/v1/official.json'
/** Maximum bytes for the published file and runtime response. */
export const OFFICIAL_FEED_BYTES = 4 * 1024 * 1024

/** A curated listing and its approved exact releases. */
export interface OfficialListing {
  /** Release that supplies the listing metadata. */ listing: RegistryRelease
  /** Versions in descending semver order. */ releases: RegistryRelease[]
}

/** Disk and HTTP share one parser, retaining only metadata used by Histoire. */
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  packages: z.array(z.strictObject({
    packument: packumentSchema,
    docsUrl: z.string().url().max(2048).optional(),
  })).max(100),
})
/** Cache objects serve multiple browse, detail and planning requests. */
type Feed = z.infer<typeof schema>
const feedListings = new WeakMap<Feed, ReadonlyMap<string, OfficialListing>>()
const bundledLogos = new Map(officialPlugins.map(entry => [entry.id, entry.logoUrl]))

/** Validate the whole snapshot before it can replace last-known-good metadata. */
export function parseOfficialFeed(input: unknown): Feed {
  const feed = schema.parse(input)
  const listings = new Map<string, OfficialListing>()
  for (const { packument, docsUrl } of feed.packages) {
    const id = packument.name
    const versions = Object.keys(packument.versions)
    if (!id.startsWith('@histoire/') || listings.has(id) || versions.length > 50 || (docsUrl && !webUrl(docsUrl))) throw new Error('Invalid official plugin listing')
    const releases = versions.sort((a, b) => compareVersions(b, a)).map((version) => {
      const release = registryRelease(packument, version)
      if (!release || !exactVersion.safeParse(version).success || !valid(version)) throw new Error(`Invalid official plugin release: ${id}@${version}`)
      const logoUrl = bundledLogos.get(id)
      // The package manager resolves missing published peers. A manifest requirement
      // still expects the dependency to be present before installation.
      const optionalPeers = Object.keys(release.detail.requires).filter(name => !Object.hasOwn(release.detail.manifest.requires ?? {}, name))
      // Keep bundled marks and monograms. Listing the catalog never fetches a package author's logo.
      return { ...release, optionalPeers, detail: { ...release.detail, official: true, logoUrl, docsUrl: docsUrl ?? release.detail.docsUrl } }
    })
    const listing = releases.find(release => release.version === packument['dist-tags'].latest && !release.deprecated)
    if (!listing) throw new Error('Missing official listing release')
    listings.set(id, { listing, releases })
  }
  feedListings.set(feed, listings)
  return feed
}

/** Return the validated projections for this snapshot. */
export function officialFeedListings(feed: Feed): ReadonlyMap<string, OfficialListing> {
  return feedListings.get(feed)!
}
