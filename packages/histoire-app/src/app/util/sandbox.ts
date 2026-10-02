import type { Story, Variant } from '../types'
import { getSandboxRelativeUrl } from '@histoire/shared'
import { base } from '../router'

/** Resolve sandbox with exact collected identities and existing grid default. */
export function getSandboxUrl(story: Story, variant?: Variant) {
  return getSandboxRelativeUrl({ base, storyId: story.id, variantId: variant?.id })
}
