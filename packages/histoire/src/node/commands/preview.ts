import pc from 'picocolors'
import { createContext } from '../context.js'
import { startPreview } from '../preview.js'

export interface PreviewOptions {
  port?: number
}

export async function previewCommand (options: PreviewOptions) {
  const ctx = await createContext({
    mode: 'build',
  })

  const { baseUrl } = await startPreview(options.port, ctx)
  console.log(`Preview server listening on ${pc.cyan(baseUrl)}`)
}
