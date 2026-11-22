import { z } from 'zod'
import { correlationSchema, exactVersion, packageName, prefsSchema } from '../catalog/validation.js'
import { optionPath } from '../manifest/schema.js'

export { exactVersion } from '../catalog/validation.js'
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
