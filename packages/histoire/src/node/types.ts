import type { TreeFile } from './tree.js'

export interface StoryFile {
  id: string
  /**
   * Absolute path
   */
  path: string
  /**
   * File name without extension
   */
  fileName: string
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
  /**
   * Data sent to user tree config functions
   */
  treeFile?: TreeFile
}

export interface Story {
  id: string
  title: string
  group?: string
  variants: Variant[]
  layout?: {
    type: 'single'
  } | {
    type: 'grid'
    width?: number | string
  }
  icon?: string
  iconColor?: string
  docsOnly?: boolean
}

export interface Variant {
  id: string
  title: string
  icon?: string
  iconColor?: string
}
