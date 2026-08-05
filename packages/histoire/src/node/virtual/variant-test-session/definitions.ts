import type { HistoireSerializedTestDefinition, HistoireTestDefinition } from '@histoire/shared'

/** Tests collected from one execution of a story's setup. */
export interface CollectedTestDefinitionGroup {
  definitions: HistoireTestDefinition[]
  /**
   * True when the execution was caused by this session's own mounts. Only their
   * handlers close over the story setup that rendered the session's canvas.
   */
  own: boolean
}

/**
 * Builds the error reported when a collected definition has no runnable
 * handler. Shared by the single-test and whole-variant run paths so both
 * surface the exact same message.
 * @param fullName Full name of the test that could not be resolved.
 * @param storyId Story the test belongs to.
 * @param variantId Variant the test belongs to.
 */
export function createMissingHandlerError(fullName: string, storyId: string, variantId: string) {
  return new Error(`Could not resolve histoire test "${fullName}" for ${storyId}:${variantId}`)
}

/**
 * Removes semantically duplicated tests emitted when the same story setup runs
 * once during bootstrap mounting and again during render mounting.
 *
 * Deduplication is occurrence-aware per GROUP (one group = one execution of
 * the story setup, see `groupRegistrationsByExecution`): loop-generated tests
 * inside a single group legitimately share name + handler source
 * (`items.forEach(item => it('works', …))`) and must all be kept, while
 * re-registrations of the same tests by a later group must be dropped. For each
 * key, the final count is the maximum occurrence count observed in any single
 * group.
 *
 * A dropped duplicate still hands its handler over to the kept definition: the
 * groups are ordered by mount phase, so the LAST group that registered a test
 * is the one whose closure belongs to the render mount — the only mount whose
 * DOM the shared collection context (`canvas`) points at. Keeping an earlier
 * mount's closure would assert against the bootstrap mount's setup scope, which
 * never rendered the variant.
 *
 * Only a group the session itself mounted may hand its handler over: the
 * ambient registry is process-wide, so a story copy mounted elsewhere (the
 * visible preview re-rendering the same story) forms its own group after the
 * render one, and its handlers close over a setup scope that belongs to another
 * canvas entirely.
 */
export function dedupeCollectedTestDefinitionGroups(groups: CollectedTestDefinitionGroup[]) {
  const emitted = new Map<string, HistoireTestDefinition[]>()
  const result: HistoireTestDefinition[] = []

  for (const group of groups) {
    const groupCounts = new Map<string, number>()

    for (const definition of group.definitions) {
      const key = `${definition.mode ?? 'run'}\n${definition.fullName}\n${definition.handler?.toString() ?? ''}`
      const occurrence = (groupCounts.get(key) ?? 0) + 1
      groupCounts.set(key, occurrence)
      const previous = emitted.get(key) ?? []

      if (occurrence > previous.length) {
        const entry = {
          ...definition,
          id: String(result.length),
        }
        previous.push(entry)
        emitted.set(key, previous)
        result.push(entry)
        continue
      }

      // Duplicate of an already-emitted occurrence: keep its position in the
      // list but adopt the later mount's handler — never a foreign mount's.
      if (definition.handler && group.own) {
        previous[occurrence - 1].handler = definition.handler
      }
    }
  }

  return result
}

/**
 * Resolves the live test definition that corresponds to a previously serialized
 * one. Positional ids (`String(index)`) are only valid when the collect and run
 * passes register tests in the exact same order; nondeterministic ordering would
 * otherwise run the wrong handler. This matches by stable identity (fullName +
 * mode) and only trusts the positional id when it also agrees on identity.
 * @param definitions The freshly re-collected definitions for this variant.
 * @param serialized The serialized definition captured during collection.
 * @returns The matching live definition, or `undefined` for a genuine miss.
 */
export function getMatchingDefinition(
  definitions: HistoireTestDefinition[],
  serialized: Pick<HistoireSerializedTestDefinition, 'id' | 'fullName' | 'mode'>,
) {
  // Treat a missing mode as the default 'run' so a serialized definition without
  // an explicit mode still matches a live one (and vice versa).
  const sameMode = (a?: string, b?: string) => (a ?? 'run') === (b ?? 'run')
  // Fast path: same positional id AND same identity (the deterministic common case).
  const byId = definitions.find(d => d.id === serialized.id)
  if (byId && byId.fullName === serialized.fullName && sameMode(byId.mode, serialized.mode)) {
    return byId
  }
  // Fallback: tolerate reordered/changed collections by matching stable identity.
  return definitions.find(d => d.fullName === serialized.fullName && sameMode(d.mode, serialized.mode)) ?? byId
}
