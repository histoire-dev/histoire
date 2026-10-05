import type { HistoireCatalogStory } from '@histoire/protocol'
import { getHistoireTargetKey } from '@histoire/protocol'
import { computed, ref, watch } from 'vue'

/** Shared match projection applies equally to frame chrome and detached canonical preview. */
export function getSearchFrameState(key: string | undefined, active: boolean, matches: readonly string[] = []) {
  const highlighted = Boolean(active && key && matches.includes(key))
  return { highlighted, dimmed: Boolean(active && key && !highlighted) }
}

/** Search stepping owns only a reveal cursor; canonical SDK/frame selection stays unchanged. */
export function createSearchFrameNavigation(options: {
  /** Current collected story defines visible frame order. */
  getStory: () => HistoireCatalogStory | undefined
  /** Exact current-query target keys, never separator-parsed identities. */
  getMatches: () => readonly string[]
  /** Stale sources, command queries and ambiguous matrix tuples cannot reveal frames. */
  isActive: () => boolean
  /** Query/source/story identity retires previous reveal intent. */
  getOwner: () => string
  /** Canonical target changes restart reveal relative to current selection. */
  getSelected: () => string | undefined
  /** Reveal exact registered frame geometry without selecting its runtime. */
  reveal: (key: string) => boolean
}) {
  const cursor = ref<string>()
  const keys = computed(() => {
    const story = options.getStory()
    if (!options.isActive() || !story) return []
    const matches = new Set(options.getMatches())
    return story.variants.map(variant => getHistoireTargetKey({ storyId: story.id, variantId: variant.id })).filter(key => matches.has(key))
  })
  const current = computed(() => cursor.value && keys.value.includes(cursor.value) ? cursor.value : options.getSelected())
  const count = computed(() => keys.value.length)
  const position = computed(() => keys.value.indexOf(current.value ?? '') + 1)
  const stopOwner = watch([options.getOwner, options.getSelected], () => cursor.value = undefined, { flush: 'sync' })
  const stopMatches = watch(keys, (value) => {
    if (cursor.value && !value.includes(cursor.value)) cursor.value = undefined
  }, { flush: 'sync' })
  /** Previous from a nonmatching selection starts at last; next starts at first. */
  function move(direction: -1 | 1) {
    if (!count.value) return
    const index = keys.value.indexOf(current.value ?? '')
    const next = index < 0 ? direction === 1 ? 0 : count.value - 1 : (index + direction + count.value) % count.value
    const key = keys.value[next]
    if (key && options.reveal(key)) cursor.value = key
  }
  return {
    count,
    position,
    /** Reveal next matching frame, wrapping in catalog order. */
    next: () => move(1),
    /** Reveal previous matching frame without changing canonical selection. */
    previous: () => move(-1),
    /** Dispose owner guards with their provider. */
    close() {
      stopOwner()
      stopMatches()
    },
  }
}
