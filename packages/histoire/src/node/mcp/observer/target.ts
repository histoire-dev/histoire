/** Pick scoped story identifiers without retaining any tool arguments. */
export function projectMcpUiTarget(input: unknown): { storyId: string, variantId?: string } | undefined {
  if (!input || typeof input !== 'object' || !('storyId' in input) || typeof input.storyId !== 'string') return
  return {
    storyId: input.storyId,
    ...('variantId' in input && typeof input.variantId === 'string' ? { variantId: input.variantId } : {}),
  }
}
