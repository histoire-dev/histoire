import { z } from 'zod'
import { correlationSchema, packageName, prefsSchema } from '../catalog/validation.js'
import { optionPath } from '../manifest/schema.js'

/** Only exact registry versions are accepted; never tags, URLs, flags or paths. */
export const exactVersion = z.string().max(128).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i)
/** Form controls admit only bounded values, never executable source. */
export const changeRequestSchema = z.strictObject({
  kind: z.enum(['install', 'remove', 'update', 'pin', 'options']),
  id: packageName,
  version: exactVersion.optional(),
  options: z.record(optionPath, z.union([z.boolean(), z.string().max(500), z.array(z.string().max(500)).max(100)])).refine(value => Object.keys(value).length <= 100).optional(),
  migrate: z.boolean().optional(),
  prefs: prefsSchema,
})
/** Correlation is validated separately so invalid intents receive private errors. */
export const planEnvelope = correlationSchema.extend({ request: z.unknown() })
