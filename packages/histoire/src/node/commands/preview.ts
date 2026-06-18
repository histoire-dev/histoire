import { createContext } from '../context.js'
import { startPreview } from '../preview.js'

export interface PreviewOptions {
  port?: number
  host?: string | boolean
  open?: boolean
}

export async function previewCommand(options: PreviewOptions) {
  const ctx = await createContext({
    mode: 'build',
  })

  for (const plugin of ctx.config.plugins) {
    if (plugin.onPreview) {
      await plugin.onPreview()
    }
  }

  const { printUrls } = await startPreview({
    port: options.port,
    host: options.host,
    open: options.open,
  }, ctx)
  printUrls()
}
