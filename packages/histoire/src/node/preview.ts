import type { Context } from './context.js'
import { createExecutionService } from './runtime/execution-service.js'
import { createPreviewHosting } from './runtime/hosting/preview.js'

/** Compatible CLI adapter over canonical immutable preview hosting. */
export async function startPreview(port: number | null, ctx: Context, outputRoot = ctx.config.outDir) {
  const execution = createExecutionService()
  try {
    const hosting = await createPreviewHosting({ context: ctx, outputRoot, execution, port: port ?? 6006, strictPort: false, onChange: () => {}, onClose: () => {} })
    return {
      baseUrl: hosting.handle.url,
      /** Closes preview resources and the CLI-owned execution lane. */
      async close() {
        try {
          await hosting.handle.close()
        }
        finally {
          await execution.close()
        }
      },
    }
  }
  catch (error) {
    await execution.close()
    throw error
  }
}
