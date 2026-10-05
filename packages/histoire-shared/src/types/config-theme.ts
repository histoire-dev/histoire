/** Customizable palette groups. */
export type CustomizableColors = 'primary' | 'gray'
/** Supported accent shade keys. */
export type ColorKeys = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
/** Neutral shades include additional dark values. */
export type GrayColorKeys = ColorKeys | '750' | '850' | '950'

/** Bundled families shared by default config and generated theme CSS. */
export const DEFAULT_THEME_FONTS = {
  /** Interface text with local system fallback. */
  sans: '"Manrope", system-ui, sans-serif',
  /** Source and measurement text with local monospace fallback. */
  mono: '"JetBrains Mono", ui-monospace, monospace',
}

/** Project appearance options; all fields remain additive. */
export interface HistoireThemeConfig {
  /** Optional introduction displayed on the home page. */
  description?: string
  /** CSS font-family overrides; bundled families are used when omitted. */
  fonts?: {
    /** Interface font family. */
    sans?: string
    /** Source and measurement font family. */
    mono?: string
  }
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
