
import { base } from '../router'
import { Story, Variant } from '../types'

export function getSandboxUrl (story: Story, variant: Variant) {
  const url = new URLSearchParams()
  url.append('storyId', story.id)
  url.append('variantId', variant.id)
  const baseUrl = base == '/' || base == "" ? base : base + '/'
  return `${baseUrl}__sandbox.html?${url.toString()}`
}
