export interface StoryFile {
  id: string
  framework: string
  component: any
  story: Story
}

export interface Story {
  id: string
  title: string
  variants: Variant[]
  layout?: {
    type: 'single'
  } | {
    type: 'grid'
    width: number
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
