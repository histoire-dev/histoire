import type { RouteLocationRaw } from 'vue-router'

export interface StoryFile {
  id: string
  framework: string
  component: any
  story: Story
  path: string[]
}

export interface Story {
  id: string
  title: string
  variants: Variant[]
  layout?: {
    type: 'single'
  } | {
    type: 'grid'
    width?: number | string
  }
  icon?: string
  iconColor?: string
  file?: StoryFile
  lastSelectedVariant?: Variant
}

export interface Variant {
  id: string
  title: string
  icon?: string
  iconColor?: string
  initState?: () => any
  slots?: () => Readonly<any>
  state?: any
  source?: string
  ready?: boolean
}

export type TreeLeaf = {
  title: string
  index: number
}

export type TreeFolder = {
  title: string
  children: (TreeFolder | TreeLeaf)[]
}

export type Tree = (TreeFolder | TreeLeaf)[]

export interface SearchResult {
  kind: 'story' | 'variant'
  rank: number
  id: string
  title: string
  route: RouteLocationRaw
  path?: string[]
  icon?: string
  iconColor?: string
}
