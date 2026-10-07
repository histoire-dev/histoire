import type { Story, Variant } from '../types'
import { getSandboxRelativeUrl } from '@histoire/shared'

/** Resolve sandbox from deployment base with exact identities and grid default. */
export function getSandboxUrl(story: Story, variant?: Variant) {
  return getSandboxRelativeUrl({ base: import.meta.env.BASE_URL as string, storyId: story.id, variantId: variant?.id })
}
