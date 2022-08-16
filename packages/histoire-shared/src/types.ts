import type {
  UserConfig as ViteConfig,
  ConfigEnv as ViteConfigEnv,
} from 'vite'
import type MarkdownIt from 'markdown-it'
import type path from 'pathe'
import type fs from 'fs-extra'
import type pc from 'picocolors'
import type chokidar from 'chokidar'

export interface StoryFile {
  id: string
  supportPluginId: string
  component: any
  story: Story
  path: string[]
  filePath: string
}

export type StoryLayout = {
  type: 'single'
  iframe?: boolean
} | {
  type: 'grid'
  width?: number | string
}

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
  // No additional properties
}

export interface StoryProps extends CommonProps, InheritedProps {
  group?: string
  layout?: StoryLayout
  docsOnly?: boolean
}

export interface Story {
  id: string
  title: string
  group?: string
  variants: Variant[]
  layout?: StoryLayout
  icon?: string
  iconColor?: string
  docsOnly?: boolean
  file?: StoryFile
  lastSelectedVariant?: Variant
  slots?: () => any
}

export interface Variant {
  id: string
  title: string
  icon?: string
  iconColor?: string
  setupApp?: (payload: any) => unknown
  slots?: () => { default: any, controls: any }
  state: any
  source?: string
  responsiveDisabled?: boolean
  autoPropsDisabled?: boolean
  configReady?: boolean
  previewReady?: boolean
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
  relativePath: string
  absolutePath: string
  isRelatedToStory: boolean
  frontmatter?: any
  html?: string
  storyFile?: ServerStoryFile
}

export interface ServerStory {
  id: string
  title: string
  group?: string
  variants: ServerVariant[]
  layout?: StoryLayout
  icon?: string
  iconColor?: string
  docsOnly?: boolean
  docsText?: string
}

export interface ServerVariant {
  id: string
  title: string
  icon?: string
  iconColor?: string
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

export interface SupportPlugin {
  id: string
  moduleName: string
  setupFn: string
  importStoriesPrepend?: string
  importStoryComponent: (file: ServerStoryFile, index: number) => string
}

export interface FinalSupportPlugin extends SupportPlugin {
  // For now, no additional properties
}

export interface ModuleLoader {
  clearCache: () => void
  loadModule: (file: string) => Promise<any>
  destroy: () => void
}

export interface PluginApiBase {
  colors: typeof pc
  path: typeof path
  fs: typeof fs
  moduleLoader: ModuleLoader

  readonly pluginTempDir: string

  log: (...msg) => void
  warn: (...msg) => void
  error: (...msg) => void

  addStoryFile: (file: string) => void
}

export interface PluginApiDev extends PluginApiBase {
  watcher: typeof chokidar
}

export type BuildEndCallback = () => Promise<void> | void
export type PreviewStoryCallback = (payload: { file: string, story: ServerStory, variant: ServerVariant, url: string }) => Promise<void> | void

export interface PluginApiBuild extends PluginApiBase {
  buildEndCallbacks: BuildEndCallback[]
  previewStoryCallbacks: PreviewStoryCallback[]

  onBuildEnd: (cb: BuildEndCallback) => void
  onPreviewStory: (cb: PreviewStoryCallback) => void
}

export interface Plugin {
  /**
   * Name of the plugin
   */
  name: string
  /**
   * Modify histoire default config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config. User config will have higher priority than default config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  defaultConfig?: (defaultConfig: HistoireConfig, mode: ConfigMode) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Modify histoire config. The hook can either mutate the passed config or
   * return a partial config object that will be deeply merged into the existing
   * config.
   *
   * Note: User plugins are resolved before running this hook so injecting other
   * plugins inside  the `config` hook will have no effect.
   */
  config?: (config: HistoireConfig, mode: ConfigMode) => Partial<HistoireConfig> | null | void | Promise<Partial<HistoireConfig> | null | void>
  /**
   * Use this hook to read and store the final resolved histoire config.
   */
  configResolved?: (config: HistoireConfig) => void | Promise<void>
  /**
   * Use this hook to do processing during development. The `onCleanup` hook
   * should handle cleanup tasks when development server is closed.
   */
  onDev?: (api: PluginApiDev, onCleanup: (cb: () => void | Promise<void>) => void) => void | Promise<void>
  /**
   * Use this hook to do processing during production build.
   */
  onBuild?: (api: PluginApiBuild) => void | Promise<void>
  /**
   * This plugin exposes a support plugin (example: Vue, Svelte, etc.)
   */
  supportPlugin?: SupportPlugin
}

export interface SupportMatchPattern {
  id: string
  patterns: string[]
  pluginIds: string[]
}

export type CustomizableColors = 'primary' | 'gray'
export type ColorKeys = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
export type GrayColorKeys = ColorKeys | '750' | '850' | '950'

export interface ResponsivePreset {
  label: string
  width: number
  height: number
}

export interface BackgroundPreset {
  label: string
  color: string
}

export interface TreeGroupConfig {
  title: string
  id?: string
  include?: (file: ServerTreeFile) => boolean
}

export interface HistoireConfig {
  plugins: Plugin[]
  /**
   * Output directory.
   */
  outDir: string
  /**
   * Glob patterns for story files to include.
   */
  storyMatch: string[]
  /**
   * Glob patterns to ignore files while searching for story files.
   */
  storyIgnored: string[]
  /**
   * Patterns to match stories to support plugins automatically.
   */
  supportMatch: SupportMatchPattern[]
  /**
   * How to generate the story tree.
   */
  tree: {
    /**
     * Use `'title'` to create the path from the title of the story, using `/` as the separator.
     *
     * Use `'path'` use the real folder structure on your computer.
     */
    file?: 'title' | 'path' | ((file: ServerTreeFile) => string[])
    order?: 'asc' | ((a: string, b: string) => number)
    groups?: TreeGroupConfig[]
  }
  /**
   * Customize the look of the histoire book.
   */
  theme: {
    /**
     * Main page title. For example: 'Acme Inc.'
     */
    title?: string
    /**
     * Custom logo files. Should be import paths (processed by Vite).
     *
     * Example: `'/src/assets/my-logo.svg'`
     */
    logo?: {
      /**
       * Square logo without text.
       */
      square?: string
      /**
       * Full logo for light theme.
       */
      light?: string
      /**
       * Full logo for dark theme.
       */
      dark?: string
    }
    /**
     * Href to the favicon file (**not** processed by Vite). Put the file in the `public` directory.
     *
     * Example: `'/favicon.ico'`
     */
    favicon?: string
    /**
     * Customize the colors. Each color should be an object with shades as keys.
     *
     * Example: ```{ primary: { 50: '#eef2ff', 100: '#e0e7ff', ..., 900: '#312e81' } }```
     *
     * You can import `defaultColors` from `'histoire'` to use predefined colors or you can create your own colors from scratch.
     */
    colors?: {
      [key in CustomizableColors]?: key extends 'gray' ? {
        [key in GrayColorKeys]?: string
      } :{
        [key in ColorKeys]?: string
      }
    }
    /**
     * Add a link to the main logo
     */
    logoHref?: string
  }
  /**
   * Setup file exporting a default function executed when setting up each story preview.
   *
   * Import custom CSS files from this file.
   *
   * Example: `'/src/histoire-setup.ts'`
   */
  setupFile?: string
  /**
   * Setup code created by plugins
   */
  setupCode?: string[]
  /**
   * Predefined responsive sizes for story playgrounds.
   */
  responsivePresets?: ResponsivePreset[]
  /**
   * Background color of the story preview.
   */
  backgroundPresets?: BackgroundPreset[]
  /**
   * Class added to the html root of the story preview when dark mode is enabled.
   */
  sandboxDarkClass?: string
  /**
   * Customize the markdown-it renderer
   */
  markdown?: (md: MarkdownIt) => MarkdownIt | Promise<MarkdownIt>
  /**
   * Change the router mode.
   * - history: use HTML history with cleaner URLs
   * - hash: use hashtag hack in the URL to support more hosting services
   */
  routerMode?: 'history' | 'hash'
  /**
   * Vite config override
   */
  vite?: ViteConfig | ((config: ViteConfig, env: ViteConfigEnv) => void | ViteConfig | Promise<void | ViteConfig>)
  /**
   * Transpile dependencies when collecting stories on Node.js
   */
  viteNodeInlineDeps?: RegExp[]
  /**
   * Determine the transform method of modules
   */
  viteNodeTransformMode?: {
    /**
     * Use SSR transform pipeline for the specified files.
     * Vite plugins will receive `ssr: true` flag when processing those files.
     *
     * @default [/\.([cm]?[jt]sx?|json)$/]
     */
    ssr?: RegExp[]
    /**
     * First do a normal transform pipeline (targeting browser),
     * then then do a SSR rewrite to run the code in Node.
     * Vite plugins will receive `ssr: false` flag when processing those files.
     *
     * @default other than `ssr`
     */
    web?: RegExp[]
  }
}

export type ConfigMode = 'build' | 'dev'
