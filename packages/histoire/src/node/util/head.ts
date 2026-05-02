import type { UseHeadInput } from 'unhead/types'
import { createHead, transformHtmlTemplate } from 'unhead/server'

export async function applyHeadTransform(html: string, head: UseHeadInput | undefined): Promise<string> {
  if (!head) return html
  // disableDefaults: don't inject unhead's `lang="en"` / viewport tags — Histoire's
  // own HTML template already provides viewport, and we shouldn't override it.
  const instance = createHead({ init: [head], disableDefaults: true })
  return await transformHtmlTemplate(instance, html)
}
