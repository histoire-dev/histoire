/**
 * Resolves which variant a story view should put in the route when it opens
 * without a `variantId` query parameter.
 *
 * Histoire deliberately does not pick a variant for multi-variant stories: the
 * variant list is displayed instead so the user chooses one (see
 * `StoryVariantSingle.vue`, which only hides the list for single-variant
 * stories). Only two cases are auto-selected:
 * - the story was already opened during this session, so the previous choice is
 *   restored — this is what makes going back to a story feel like resuming it;
 * - the story has exactly one variant, where showing a list to pick from would
 *   be pointless.
 *
 * Kept free of any import so it can be unit tested from the `histoire` package,
 * which cannot resolve the app's `vue-router` alias.
 *
 * @param story Story being opened, or nullish while the route matches no story.
 * @param currentVariant Variant already resolved from the URL, if any.
 * @returns Variant id to write to the route, or `null` to leave the URL alone.
 */
export function resolveAutoSelectedVariantId(
  story: { variants: readonly { id: string }[], lastSelectedVariant?: { id: string } } | null | undefined,
  currentVariant: { id: string } | null | undefined,
): string | null {
  if (currentVariant || !story) {
    return null
  }

  // `lastSelectedVariant` holds a variant object captured on a previous visit,
  // which a hot update can replace or drop entirely. Restoring an id that no
  // longer exists would put a dead `variantId` in the URL and render nothing,
  // so the previous choice is only restored while the variant is still there.
  const lastSelectedId = story.lastSelectedVariant?.id
  if (lastSelectedId != null && story.variants.some(variant => variant.id === lastSelectedId)) {
    return lastSelectedId
  }

  if (story.variants.length === 1) {
    return story.variants[0].id
  }

  return null
}
