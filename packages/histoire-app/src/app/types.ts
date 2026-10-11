import type { RouteLocationRaw } from 'vue-router'
import type { DevEventRequestOptions } from './util/dev-event-api.js'

export type {
  Story,
  StoryFile,
  StoryLayout,
  Variant,
} from '@histoire/shared'

export interface TreeLeaf {
  title: string
  index: number
}

export interface TreeFolder {
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export interface TreeGroup {
  group: true
  id: string
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export type Tree = (TreeGroup | TreeFolder | TreeLeaf)[]

export type SearchResultType = 'title' | 'docs'

export interface SearchResultBase {
  kind: 'story' | 'variant' | 'command'
  rank: number
  id: string
  title: string
  path?: string[]
  icon?: string
  iconColor?: string
  type?: SearchResultType
}

export type SearchResult = SearchResultBase & ({
  route: RouteLocationRaw
} | {
  onActivate: () => unknown
})

export type { PreviewSettings } from '@histoire/shared'

declare module 'vue' {
  interface ComponentCustomProperties {
    __HISTOIRE_DEV__: boolean
  }
}

declare global {
  const __HISTOIRE_DEV__: boolean

  interface Window {
    __HST_PLUGIN_API__: {
      sendEvent: (event: string, payload: any, signal?: AbortSignal, onProgress?: (progress: any) => void, options?: DevEventRequestOptions) => Promise<any>
      openStory: (storyId: string) => void
    }
  }
}
