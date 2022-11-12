import type { Plugin } from 'histoire'
import { defu } from 'defu'
import path from 'pathe'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { isPercyEnabled, fetchPercyDOM, postSnapshot } from '@percy/sdk-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export interface PercyPluginOptions {
  /**
   * Ignored stories.
   */
  ignored?: (payload: { file: string, story: { title: string }, variant: { id: string, title: string } }) => boolean
  /**
   * Percy options.
   */
  percyOptions?: any
}

const defaultOptions: PercyPluginOptions = {
  percyOptions: {},
}

export function HstPercy (options: PercyPluginOptions = {}): Plugin {
  const finalOptions: PercyPluginOptions = defu(options, defaultOptions)
  return {
    name: '@histoire/plugin-percy',

    onBuild: async api => {
      if (!await isPercyEnabled()) {
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
        if (finalOptions.ignored?.({
          file,
          story: {
            title: story.title,
          },
          variant: {
            id: variant.id,
            title: variant.title,
          },
        })) {
          return
        }

        const page = await browser.newPage()
        await page.goto(url)

        const name = `${story.title} > ${variant.title}`
        await page.evaluate(await fetchPercyDOM())
        const domSnapshot = await page.evaluate((opts) => {
          // @ts-expect-error window global var
          return window.PercyDOM.serialize(opts)
        }, finalOptions.percyOptions)
        await postSnapshot({
          ...finalOptions.percyOptions,
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
