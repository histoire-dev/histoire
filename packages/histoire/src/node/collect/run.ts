import type { ServerRunPayload } from '@histoire/shared'

export async function run (payload: ServerRunPayload) {
  let result: any

  // @TODO if (vue3)
  {
    const { run } = await import('@histoire/plugin-vue/collect')
    result = await run(payload)
  }

  return result
}
