import type MarkdownIt from 'markdown-it'
import type {
  UserConfig as ViteConfig,
  ConfigEnv as ViteConfigEnv,
} from 'vite'
import type { Plugin } from './plugin.js'
import type { ServerTreeFile, StoryProps } from './story.js'

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
  height?: number
}

export interface BackgroundPreset {
  label: string
  color: string
  contrastColor?: string
}

export interface TreeGroupConfig {
  title: string
  id?: string
  include?: (file: ServerTreeFile) => boolean
}

export interface HistoireConfig {
  plugins: Plugin[]
  /** Default-on separate loopback MCP endpoint during dev; deployed mode records enabled policy. */
  mcp?: boolean | {
    /** Disable MCP explicitly; absent means enabled. */
    enabled?: boolean
    /** Dev loopback port; zero requests an ephemeral port. Default 6007 may fall back on collision. */
    port?: number
  }
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
      } : {
        [key in ColorKeys]?: string
      }
    }
    /**
     * Add a link to the main logo
     */
    logoHref?: string
    /**
     * Default color scheme for the app.
     */
    defaultColorScheme?: 'light' | 'dark' | 'auto'
    /**
     * Hides the dark mode button in the toolbar.
     */
    hideColorSchemeSwitch?: boolean
    /**
     * Enable persistence of the color scheme in the browser.
     */
    storeColorScheme?: boolean
    /**
     * Class added to the story preview when dark mode is enabled.
     */
    darkClass?: string
  }
  /**
   * Setup file exporting a default function executed when setting up each story preview.
   *
   * Import custom CSS files from this file.
   *
   * Example: `'/src/histoire-setup.ts'`
   */
  setupFile?: string | {
    /**
     * Only loaded in the browser client.
     */
    browser: string
  } | {
    /**
     * Only loaded while collecting stories in the node server.
     */
    server: string
  } | {
    /**
     * Only loaded in the browser client.
     */
    browser: string
    /**
     * Only loaded while collecting stories in the node server.
     */
    server: string
  }
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
   * Automatically apply the current background preset's contrast color to the story preview text.
   */
  autoApplyContrastColor?: boolean
  /**
   * Class added to the html root of the story preview when dark mode is enabled.
   * @deprecated use `theme.darkClass` instead
   */
  sandboxDarkClass?: string
  /**
   * Default props for stories.
   */
  defaultStoryProps?: Omit<StoryProps, 'id' | 'setupApp' | 'title' | 'source'>
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
   * Remove those plugins from the Vite configuration
   */
  viteIgnorePlugins?: string[]
  /**
   * Transpile dependencies when collecting stories on Node.js
   */
  viteNodeInlineDeps?: (string | RegExp)[]
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
  /**
   * Maximum number of threads used to collect stories.
   * By default based on available number of cores.
   */
  collectMaxThreads?: number
  /**
   * Build options
   */
  build?: {
    /** Deployment artifact layout. Static retains the usual browser-only output. */
    target?: 'static' | 'node'
    /** Options applying only to standalone Node deployment artifacts. */
    node?: {
      /** Include registered raw source in private MCP content. Defaults to true. */
      includeSource?: boolean
    }
    /**
     * By default all dependencies in `node_modules` are bundled into a single 'vendors' file.
     * You can use this option to exclude some dependencies from this file.
     */
    excludeFromVendorsChunk?: (string | RegExp)[]
  }
  /**
   * Test runtime integration.
   */
  test?: {
    /**
     * Strategy used to collect stories during build.
     * - browser: headless browser collection
     * - hybrid: keep the Node collector for build-time metadata
     */
    buildCollection?: 'browser' | 'hybrid'
    /**
     * Maximum time in milliseconds the headless browser story collection is
     * allowed to take before the run is aborted.
     *
     * @default 120000
     */
    collectTimeout?: number
    /**
     * Maximum time in milliseconds a single story is allowed to take to load
     * and mount while collecting in the browser.
     *
     * Guards the whole batch against one story that never settles: only that
     * story fails, the others still collect.
     *
     * @default 30000
     */
    storyCollectTimeout?: number
    /**
     * Maximum time in milliseconds a `histoire test` run is allowed to take
     * before it is aborted.
     *
     * @default 300000
     */
    runTimeout?: number
  }
}

export type ConfigMode = 'build' | 'dev'
