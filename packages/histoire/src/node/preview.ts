import type { Context } from './context.js'
import { preview } from 'vite'

export interface StartPreviewOptions {
  port?: number
  host?: string | boolean
  open?: boolean
}

interface ReturnPayload {
  baseUrl: string
  printUrls: () => void
  close: () => Promise<void>
}

export async function startPreview(options: StartPreviewOptions, ctx: Context): Promise<ReturnPayload> {
  const port = options.port ?? 6006
  const server = await preview({
    root: ctx.root,
    base: ctx.resolvedViteConfig.base,
    configFile: false,
    build: {
      outDir: ctx.config.outDir,
    },
    preview: {
      port,
      host: options.host,
      open: options.open,
      strictPort: false,
    },
  })

  const baseUrl = server.resolvedUrls?.local[0] ?? `http://localhost:${port}${ctx.resolvedViteConfig.base}`

  return {
    baseUrl,
    printUrls: () => server.printUrls(),
    close: () => server.close(),
  }
}
