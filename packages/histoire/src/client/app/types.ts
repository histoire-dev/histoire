import { App } from 'vue'
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
  group?: string
  variants: Variant[]
  layout?: {
    type: 'single'
    iframe?: boolean
  } | {
    type: 'grid'
    width?: number | string
  }
  icon?: string
  iconColor?: string
  docsOnly?: boolean
  file?: StoryFile
  lastSelectedVariant?: Variant
  slots?: () => Readonly<any>
}

export interface Variant {
  id: string
  title: string
  icon?: string
  iconColor?: string
  initState?: () => any
  setupApp?: (payload: any) => unknown
  slots?: () => Readonly<any>
  state?: any
  source?: string
  responsiveDisabled?: boolean
  configReady?: boolean
  previewReady?: boolean
}

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

export interface PreviewSettings {
  responsiveWidth: number
  responsiveHeight: number
  rotate: boolean
  backgroundColor: string
  checkerboard: boolean
}

export interface PropDefinition {
  name: string
  types?: string[]
  required?: boolean
  default?: any
}

export interface AutoPropComponentDefinition {
  name: string
  index: number
  props: PropDefinition[]
}
