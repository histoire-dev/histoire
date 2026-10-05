import type { HistoireTarget } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed } from 'vue'

/** Workbench selection reads canonical snapshots from its exact provider session. */
export function useSelection() {
  const { session } = useHistoireContext()
  const snapshot = useHistoireSnapshot()
  const story = computed(() => snapshot.value.catalog.stories.find(item => item.id === snapshot.value.selection?.storyId))
  const variant = computed(() => story.value?.variants.find(item => item.id === snapshot.value.selection?.variantId))
  /** Runtime/router authority remains in session's explicit selection adapter. */
  function select(target: HistoireTarget | { storyId: string }): Promise<void> {
    return session.selection.select(target)
  }
  /** Missing variant preserves standalone remembered/chooser behavior. */
  function selectStory(storyId: string): Promise<void> {
    return select({ storyId })
  }
  /** Select exact opaque variant identity, without splitting composite IDs. */
  function selectVariant(storyId: string, variantId: string | null): Promise<void> {
    return select({ storyId, variantId })
  }
  return { session, snapshot, story, variant, select, selectStory, selectVariant }
}
