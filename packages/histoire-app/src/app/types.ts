import type { RouteLocationRaw } from 'vue-router'

export type {
  StoryFile,
  StoryLayout,
  Story,
  Variant,
} from '@histoire/shared'

export type TreeLeaf = {
  title: string
  index: number
}

export type TreeFolder = {
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

export interface SearchResult {
  kind: 'story' | 'variant'
  rank: number
  id: string
  title: string
  route: RouteLocationRaw
  type: SearchResultType
  path?: string[]
  icon?: string
  iconColor?: string
}

export interface PreviewSettings {
  responsiveWidth: number
  responsiveHeight: number
  rotate: boolean
  backgroundColor: string
  checkerboard: boolean
}
