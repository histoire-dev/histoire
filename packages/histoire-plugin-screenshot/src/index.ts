import type { FileOptions } from 'capture-website'
import type { Plugin } from 'histoire'
import { defu } from 'defu'
import fs from 'fs-extra'
import path from 'pathe'

interface ScreenshotPresets {
  /**
   * Screenshot width.
   */
  width?: number
  /**
   * Screenshot height.
   */
  height?: number
}

export interface ScreenshotPluginOptions {
  /**
   * Folder were screenshots will be saved.
   */
  saveFolder?: string
  /**
   * Ignored stories.
   */
  ignored?: (payload: { file: string, story: { title: string }, variant: { id: string, title: string } }) => boolean
  /**
   * Presets for each screenshot.
   */
  presets?: ScreenshotPresets[]
  /**
   * Args for puppeteer
   */
  launchOptionsArgs?: string[]
}

const defaultOptions: ScreenshotPluginOptions = {
  saveFolder: '.histoire/screenshots',
  presets: [],
}

export function HstScreenshot(options: ScreenshotPluginOptions = {}): Plugin {
  const finalOptions: ScreenshotPluginOptions = defu(options, defaultOptions)
  if (!finalOptions.presets.length) {
    finalOptions.presets.push({
      width: 1280,
      height: 800,
    })
  }
  return {
    name: '@histoire/plugin-screenshot',

    onBuild: async (api) => {
      const { default: captureWebsite } = await import('capture-website')
      await fs.ensureDir(finalOptions.saveFolder)

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
        console.log('Rendering screenshot for', file, 'title:', story.title, 'variant:', variant.id, 'title:', variant.title)
        for (const preset of finalOptions.presets) {
          const launchOptions = finalOptions.launchOptionsArgs
            ? {
                args: finalOptions.launchOptionsArgs,
              }
            : {}
          const captureWebsiteFileOptions: FileOptions = {
            overwrite: true,
            width: preset.width,
            height: preset.height,
            fullPage: true,
            launchOptions,
          }
          await captureWebsite.file(url, path.join(finalOptions.saveFolder, `${story.id}-${variant.id}-${preset.width}x${preset.height}.png`), captureWebsiteFileOptions)
        }
      })
    },
  }
}
