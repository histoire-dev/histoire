import { base } from '../router'
import type { Story, Variant } from '../types'

export function getSandboxUrl(story: Story, variant?: Variant) {
  const url = new URLSearchParams()
  url.append('storyId', story.id)
  if (variant) {
    url.append('variantId', variant.id)
  }
  else {
    url.append('grid', 'true')
  }
  return `${base}__sandbox.html?${url.toString()}`
}
