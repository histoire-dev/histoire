import type { HistoireMatrixDeclaration, HistoireMatrixValue, HistoireStoryFileOrigin, HistoireStoryFrame } from '@histoire/protocol'

export interface StoryFile {
  id: string
  supportPluginId: string
  component: any
  story: Story
  path: string[]
  filePath: string
  /** Ownership of the registered file relative to the user project. */
  fileOrigin?: HistoireStoryFileOrigin
  hasVitestMocks?: boolean
  docsFilePath?: string
  source: () => Promise<{ default: string }>
}

export type StoryLayout = ({
  type: 'single'
} | {
  type: 'grid'
}) & HistoireStoryFrame

export interface CommonProps {
  id?: string
  title?: string
  icon?: string
  iconColor?: string
}

export interface InheritedProps {
  setupApp?: (payload: any) => unknown
  source?: string
  responsiveDisabled?: boolean
  autoPropsDisabled?: boolean
}

export interface VariantProps extends CommonProps, InheritedProps {
  /** JSON metadata published in the catalog for plugins (e.g. `design`). */
  meta?: VariantMeta
}

export interface StoryProps extends CommonProps, InheritedProps {
  group?: string
  layout?: StoryLayout
  docsOnly?: boolean
  /** Explicit finite values for props matrix axes. */
  matrix?: HistoireMatrixDeclaration
  /** JSON metadata published in the catalog for plugins (e.g. `design`). */
  meta?: StoryMeta
}

export interface CommonMeta {}

export interface StoryMeta extends CommonMeta {}

export interface Story {
  id: string
  title: string
  group?: string
  variants: Variant[]
  layout?: StoryLayout
  /** Explicit finite values for props matrix axes. */
  matrix?: HistoireMatrixDeclaration
  icon?: string
  iconColor?: string
  docsOnly?: boolean
  file?: StoryFile
  /** Collected documentation fallback when the host cannot import this story. */
  docsText?: string
  lastSelectedVariant?: Variant
  slots?: () => any
  meta?: StoryMeta
}

export interface VariantMeta extends CommonMeta {}

export interface Variant {
  id: string
  title: string
  icon?: string
  iconColor?: string
  setupApp?: (payload: any) => unknown
  slots?: () => { default: any, controls: any, source: any }
  state: any
  source?: string
  responsiveDisabled?: boolean
  autoPropsDisabled?: boolean
  configReady?: boolean
  previewReady?: boolean
  meta?: VariantMeta
}

export interface PropDefinition {
  name: string
  types?: string[]
  required?: boolean
  default?: any
  /** Actual finite scalar source prop, before any controls override. */
  value?: HistoireMatrixValue
  /** Finite enum values advertised by runtime prop metadata. */
  values?: readonly HistoireMatrixValue[]
}

export interface AutoPropComponentDefinition {
  name: string
  index: number
  props: PropDefinition[]
}

/* SERVER */

export interface ServerStoryFile {
  id: string
  /**
   * Absolute path
   */
  path: string
  /**
   * Relative path
   */
  relativePath: string
  /** Ownership of the registered file relative to the user project. */
  fileOrigin?: HistoireStoryFileOrigin
  /**
   * File name without extension
   */
  fileName: string
  /**
   * Support plugin (Vue, Svelte, etc.)
   */
  supportPluginId: string
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
  story?: ServerStory
  /**
   * Data sent to user tree config functions
   */
  treeFile?: ServerTreeFile
  /**
   * Is virtual module
   */
  virtual?: boolean
  /**
   * Virtual module code
   */
  moduleCode?: string
  /**
   * Related markdown docs
   */
  markdownFile?: ServerMarkdownFile
}

export interface ServerMarkdownFile {
  id: string
  relativePath: string
  absolutePath: string
  isRelatedToStory: boolean
  frontmatter?: any
  html?: string
  content?: string
  storyFile?: ServerStoryFile
}

export interface ServerStory {
  id: string
  title: string
  group?: string
  variants: ServerVariant[]
  layout?: StoryLayout
  /** Story or defaultStoryProps declared layout before collection fallback. */
  layoutExplicit?: boolean
  /** Explicit finite values for props matrix axes. */
  matrix?: HistoireMatrixDeclaration
  icon?: string
  iconColor?: string
  docsOnly?: boolean
  docsText?: string
  meta?: StoryMeta
  /** Collected `meta` exceeded the catalog metadata bounds and was dropped at collection. */
  metaOmitted?: boolean
  /**
   * Whether the story or one of its variants declares a `controls` slot.
   * Set by support plugins that know at collection; absent when unknown.
   */
  hasCustomControls?: boolean
}

export interface ServerVariant {
  id: string
  title: string
  icon?: string
  iconColor?: string
  meta?: VariantMeta
  /** Collected `meta` exceeded the catalog metadata bounds and was dropped at collection. */
  metaOmitted?: boolean
}

export interface ServerTreeFile {
  title: string
  path: string
}

export interface ServerTreeLeaf {
  title: string
  index: number
}

export interface ServerTreeFolder {
  title: string
  children: (ServerTreeFolder | ServerTreeLeaf)[]
}

export interface ServerTreeGroup {
  group: true
  id: string
  title: string
  children: (ServerTreeFolder | ServerTreeLeaf)[]
}

export type ServerTree = (ServerTreeGroup | ServerTreeFolder | ServerTreeLeaf)[]

export interface ServerRunPayload {
  file: ServerStoryFile
  storyData: ServerStory[]
  el: HTMLElement
}
