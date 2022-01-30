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
  lastSelectedVariant?: Variant
  mountTime: number
}

export interface Variant {
  id: string
  title: string
  initState: () => any
  slots: () => Readonly<any>
  state: any
}
