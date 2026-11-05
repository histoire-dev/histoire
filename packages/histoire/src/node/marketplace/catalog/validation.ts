import { z } from 'zod'
import { addKinds, categories } from '../manifest/schema.js'

/** Exact npm identity, safe for registry paths and project lookups. */
export const packageName = z.string().max(214).regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)
/** Browser-local preferences, never project settings. */
export const prefsSchema = z.object({ community: z.boolean(), packageManager: z.enum(['auto', 'pnpm', 'npm', 'yarn', 'bun']), afterInstall: z.enum(['restart', 'ask']), skippedVersions: z.record(packageName, z.string().max(128)) })
/** Bounded correlation envelope parsed before feature validation. */
export const correlationSchema = z.object({ requestId: z.string().min(1).max(128) })
/** Catalog request limits keep ranking, facets and response work bounded. */
export const catalogQuerySchema = z.object({
  view: z.enum(['all', 'discover']),
  query: z.string().max(500).optional(),
  filters: z.object({ collection: z.string().min(1).max(100).optional(), category: z.enum(categories).optional(), frameworks: z.array(z.string().min(1).max(100)).max(20).optional(), officialOnly: z.boolean().optional(), adds: z.array(z.enum(addKinds)).max(7).optional() }).optional(),
  sort: z.enum(['relevance', 'name', 'updated']).optional(),
  prefs: prefsSchema,
  cursor: z.string().regex(/^\d{1,9}$/).optional(),
  limit: z.number().int().min(1).max(60).optional(),
})
