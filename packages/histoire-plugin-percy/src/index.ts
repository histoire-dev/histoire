import type { Plugin } from 'histoire'
import type { Page, WaitForOptions } from 'puppeteer'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { fetchPercyDOM, isPercyEnabled, postSnapshot } from '@percy/sdk-utils'
import { defu } from 'defu'
import path from 'pathe'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Percy Snapshot Options
 * Not official type, just for reference
 * @see https://www.browserstack.com/docs/percy/take-percy-snapshots/snapshots-via-scripts
 */
export interface PercySnapshotOptions {
  widths?: number[]
  minHeight?: number
  percyCSS?: string
  enableJavaScript?: boolean
  discovery?: Partial<{
    allowedHostnames: string[]
    disallowedHostnames: string[]
    requestHeaders: Record<string, string>
    authorization: Partial<{
      username: string
      password: string
    }>
    disableCache: boolean
    userAgent: string
  }>
}

export interface PagePayload {
  file: string
  story: { title: string }
  variant: { id: string, title: string }
}

type ContructorOption<T extends object | number> =
  | T
  | ((payload: PagePayload) => T)

export interface PercyPluginOptions {
  /**
   * Ignored stories.
   */
  ignored?: (payload: PagePayload) => boolean
  /**
   * Percy options.
   */
  percyOptions?: ContructorOption<PercySnapshotOptions>

  /**
   * Delay puppeteer page screenshot after page load
   */
  pptrWait?: ContructorOption<number>

  /**
   * Navigation Parameter
   */
  pptrOptions?: ContructorOption<
    WaitForOptions & {
      referer?: string
    }
  >

  /**
   * Before taking a snapshot, you can modify the page
   * It happens after the page is loaded and wait (if pptrWait is passed) and before the snapshot is taken
   *
   * @param page Puppeteer page
   * @returns Promise<void | boolean> - If it returns false, the snapshot will be skipped
   */
  beforeSnapshot?: (
    page: Page,
    payload: PagePayload
  ) => Promise<void | boolean>
}

const defaultOptions: PercyPluginOptions = {
  percyOptions: {},
  pptrWait: 0,
  pptrOptions: {},
}

function resolveOptions<T extends object | number>(
  option: ContructorOption<T>,
  payload: PagePayload,
): T {
  return typeof option === 'function' ? option(payload) : option
}

export function HstPercy(options: PercyPluginOptions = {}): Plugin {
  const finalOptions: PercyPluginOptions = defu(options, defaultOptions)
  return {
    name: '@histoire/plugin-percy',

    onBuild: async (api) => {
      if (!(await isPercyEnabled())) {
        return
      }

      const puppeteer = await import('puppeteer')
      const browser = await puppeteer.launch()

      // Collect client and env info
      const sdkPkg = require(path.join(__dirname, '../package.json'))
      const puppeteerPkg = require('puppeteer/package.json')
      const CLIENT_INFO = `${sdkPkg.name}/${sdkPkg.version}`
      const ENV_INFO = `${puppeteerPkg.name}/${puppeteerPkg.version}`

      api.onPreviewStory(async ({ file, story, variant, url }) => {
        const payload = {
          file,
          story: {
            title: story.title,
          },
          variant: {
            id: variant.id,
            title: variant.title,
          },
        }

        if (finalOptions.ignored?.(payload)) {
          return
        }

        const pptrOptions = resolveOptions(finalOptions.pptrOptions, payload)
        const pptrWait = resolveOptions(finalOptions.pptrWait, payload)
        const percyOptions = resolveOptions(finalOptions.percyOptions, payload)

        const page = await browser.newPage()
        await page.goto(url, pptrOptions)

        await new Promise(resolve => setTimeout(resolve, pptrWait))

        if (finalOptions.beforeSnapshot) {
          const result = await finalOptions.beforeSnapshot(page, payload)
          if (result === false) {
            return
          }
        }

        const name = `${story.title} > ${variant.title}`
        await page.evaluate(await fetchPercyDOM())
        const domSnapshot = await page.evaluate((opts) => {
          // @ts-expect-error window global var
          return window.PercyDOM.serialize(opts)
        }, percyOptions)
        await postSnapshot({
          ...percyOptions,
          environmentInfo: ENV_INFO,
          clientInfo: CLIENT_INFO,
          url: page.url(),
          domSnapshot,
          name,
        })
      })

      api.onBuildEnd(async () => {
        await browser.close()
      })
    },
  }
}
