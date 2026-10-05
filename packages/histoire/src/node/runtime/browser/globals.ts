import { validateSettingsPatch } from '@histoire/protocol'
import { z } from 'zod/v4'

/** Node adapters use same portable bounds; no second globals definition. */
export const previewGlobalsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).superRefine((value, context) => {
  try {
    validateSettingsPatch({ globals: value })
  }
  catch {
    context.addIssue({ code: 'custom', message: 'Invalid preview globals' })
  }
}).transform(value => Object.freeze({ ...value }))
