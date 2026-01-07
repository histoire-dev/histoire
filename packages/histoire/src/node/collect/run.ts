import type { ServerRunPayload } from '@histoire/shared'
import { atob as NodeAtob } from 'node:buffer'
// @ts-expect-error virtual module
import { collectSupportPlugins } from 'virtual:$histoire-support-plugins-collect'

// Polyfill atob, which can hang in Node.js environments where it's not available.
// See: https://github.com/histoire-dev/histoire/issues/821
globalThis.atob = NodeAtob

export async function run(payload: ServerRunPayload) {
  const { run } = await collectSupportPlugins[payload.file.supportPluginId]()
  const result = await run(payload)
  return result
}
