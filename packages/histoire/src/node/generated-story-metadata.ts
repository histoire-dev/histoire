const knownEmptyGeneratedStories = new WeakSet<object>()

/**
 * Marks one trusted generated story object as having no test registrations.
 * @param story The generated story options object.
 * @returns The same object, so story identity stays unchanged.
 */
export function markGeneratedStoryKnownEmpty<T extends object>(story: T): T {
  knownEmptyGeneratedStories.add(story)
  return story
}

/**
 * Checks private generation metadata without adding fields to the story object.
 * @param story The story object captured from the generated module.
 * @returns Whether Histoire itself marked this exact object.
 */
export function isGeneratedStoryKnownEmpty(story: unknown): story is object {
  if ((typeof story !== 'object' || story === null) && typeof story !== 'function') return false
  return knownEmptyGeneratedStories.has(story as object)
}
