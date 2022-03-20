import { Story, Variant } from '../../types'

export function getSandboxUrl (story: Story, variant: Variant) {
  const url = new URLSearchParams()
  url.append('storyId', story.id)
  url.append('variantId', variant.id)
  return '/__sandbox?' + url.toString()
}
