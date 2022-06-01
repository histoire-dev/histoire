import pc from 'picocolors'
import { createContext } from '../context.js'
import { resolveViteConfig } from '../vite.js'
import { startPreview } from '../preview.js'

export interface PreviewOptions {
  port?: number
}

export async function previewCommand (options: PreviewOptions) {
  const ctx = await createContext({
    mode: 'build',
  })
  const viteConfig = await resolveViteConfig(ctx)

  const { baseUrl } = await startPreview(viteConfig, options.port, ctx)
  console.log(`Preview server listening on ${pc.cyan(baseUrl)}`)
}
