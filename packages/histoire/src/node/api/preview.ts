import type { createPreviewHosting } from '../runtime/hosting/preview.js'
import { closeContext, createContext } from '../context.js'
import { createPreviewHosting as createHosting } from '../runtime/hosting/preview.js'

/** Acquires fresh configuration only; built lookup never scans live story sources. */
export async function previewProject(root: string, configFile: string | undefined, options: Omit<Parameters<typeof createPreviewHosting>[0], 'context'>) {
  const context = await createContext({ root, configFile, mode: 'build' })
  try {
    return await createHosting({ ...options, context })
  }
  catch (error) {
    try {
      await closeContext(context)
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], String(error))
    }
    throw error
  }
}
