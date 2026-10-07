import type { StoryFile } from '@histoire/shared'

/**
 * Resolves one catalog variant or preserves the collection mount's error.
 * @param file The mapped story file with current catalog variants.
 * @param variantId The requested variant identity.
 * @returns The matching mapped variant.
 */
export function getStoryVariant(file: StoryFile, variantId: string): StoryFile['story']['variants'][number] {
  const variant = file.story.variants.find(item => item.id === variantId)
  if (!variant) {
    throw new Error(`Unknown histoire variant "${variantId}" in story "${file.story?.id}"`)
  }
  return variant
}
