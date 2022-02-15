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
  file?: StoryFile
  lastSelectedVariant?: Variant
}

export interface Variant {
  id: string
  title: string
  initState?: () => any
  slots?: () => Readonly<any>
  state?: any
  source?: string
}

export type TLeaf = {
  title: string
  index: number
}

export type TFolder = {
  title: string
  children: (TFolder | TLeaf)[]
}

export type TTree = (TFolder | TLeaf)[]
