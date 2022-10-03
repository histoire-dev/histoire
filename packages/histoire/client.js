export * from '@histoire/app'

export function isCollecting () {
  return process.env.HST_COLLECT === 'true'
}
