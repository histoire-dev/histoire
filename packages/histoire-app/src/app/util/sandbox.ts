import type { Story, Variant } from '../types'
import { base } from '../router'

export function getSandboxUrl(story: Story, variant: Variant) {
  const url = new URLSearchParams()
  url.append('storyId', story.id)
  url.append('variantId', variant.id)
  return `${base}__sandbox.html?${url.toString()}`
}
