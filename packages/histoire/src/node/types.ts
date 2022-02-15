export interface StoryFile {
  id: string
  /**
   * Absolute path
   */
  path: string
  /**
   * Generated path for tree UI
   */
  treePath?: string[]
  /**
   * Use the module id in imports to allow HMR
   */
  moduleId: string
  /**
   * Resolved story data from story file execution
   */
  story?: Story
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
}

export interface Variant {
  id: string
  title: string
}
