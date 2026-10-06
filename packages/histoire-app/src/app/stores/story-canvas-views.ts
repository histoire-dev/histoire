import type { InjectionKey } from 'vue'
import type { CanvasViewSnapshot } from './canvas.js'
import { inject, provide, shallowReactive, shallowRef } from 'vue'

/** Workbench-local owner for story views and the optional shared view. */
export interface StoryCanvasViews {
  /** Read one story view as a detached snapshot. */
  getStory: (storyId: string) => CanvasViewSnapshot | undefined
  /** Replace one story view with an isolated copy. */
  saveStory: (storyId: string, snapshot: CanvasViewSnapshot) => void
  /** Read the shared Sync zoom view as a detached snapshot. */
  getShared: () => CanvasViewSnapshot | undefined
  /** Replace the shared Sync zoom view with an isolated copy. */
  saveShared: (snapshot: CanvasViewSnapshot) => void
}

const storyCanvasViewsKey: InjectionKey<StoryCanvasViews> = Symbol('histoire-story-canvas-views')

/** Copy nested coordinates and zoom preferences at every ownership boundary. */
function copyView(snapshot: CanvasViewSnapshot): CanvasViewSnapshot {
  return { arrangement: snapshot.arrangement, zoomByArrange: { ...snapshot.zoomByArrange }, panOffset: { ...snapshot.panOffset } }
}

/** Creates state scoped to one workbench provider; nothing reaches browser storage. */
export function createStoryCanvasViews(): StoryCanvasViews {
  const stories = shallowReactive(new Map<string, CanvasViewSnapshot>())
  const shared = shallowRef<CanvasViewSnapshot>()
  return {
    getStory: (storyId) => {
      const view = stories.get(storyId)
      return view ? copyView(view) : undefined
    },
    saveStory: (storyId, snapshot) => stories.set(storyId, copyView(snapshot)),
    getShared: () => shared.value ? copyView(shared.value) : undefined,
    saveShared: snapshot => shared.value = copyView(snapshot),
  }
}

/** Provide story view ownership for the mounted canvas and its remounts. */
export function provideStoryCanvasViews(views: StoryCanvasViews): void {
  provide(storyCanvasViewsKey, views)
}

/** Read the nearest workbench's story view owner. */
export function useStoryCanvasViews(): StoryCanvasViews {
  const views = inject(storyCanvasViewsKey)
  if (!views) throw new Error('Story canvas views require provideStoryCanvasViews().')
  return views
}
