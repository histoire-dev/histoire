import type { StoryCanvasViews } from '../stores/story-canvas-views.js'
import { computed } from 'vue'

/** Preserve story layout defaults on legacy URLs, with explicit URL overrides first. */
export function resolveWorkbenchArrangement(query: unknown, storyLayout: unknown, localDefault?: 'grid' | 'list', projectDefault?: 'grid' | 'list'): 'grid' | 'list' | 'matrix' {
  if (query === 'grid' || query === 'list' || query === 'matrix') return query
  if (storyLayout === 'grid' || storyLayout === 'list') return storyLayout
  return localDefault ?? projectDefault ?? 'grid'
}

/** Resolve route, story memory, and existing defaults for one workbench. */
export function createWorkbenchArrangement(options: {
  /** Current query override candidate. */
  query: () => unknown
  /** Current story identity. */
  storyId: () => string | undefined
  /** Story-declared default arrangement. */
  storyLayout: () => unknown
  /** Local user default. */
  localDefault: () => 'grid' | 'list' | undefined
  /** Project default. */
  projectDefault: () => 'grid' | 'list' | undefined
  /** Current cross-story view mode. */
  syncZoom: () => boolean
  /** Workbench-scoped in-memory view snapshots. */
  views: StoryCanvasViews
}) {
  const base = computed(() => resolveWorkbenchArrangement(undefined, options.storyLayout(), options.localDefault(), options.projectDefault()))
  const override = computed(() => isArrangement(options.query()))
  const arrangement = computed(() => {
    const query = options.query()
    if (isArrangement(query)) return query
    const storyId = options.storyId()
    const saved = options.syncZoom() ? options.views.getShared() : storyId ? options.views.getStory(storyId) : undefined
    return saved?.arrangement ?? base.value
  })
  return { arrangement, base, override }
}

/** Test whether a route query names a supported canvas arrangement. */
function isArrangement(value: unknown): value is 'grid' | 'list' | 'matrix' {
  return value === 'grid' || value === 'list' || value === 'matrix'
}
