import type { Context } from '../context.js'
import fs from 'node:fs'
import path from 'pathe'
import pc from 'picocolors'
import { resolveEmbedConfig } from './embed.js'

/**
 * Resolves the file paths held by the config against the project root and
 * validates that they exist, in place on `ctx.config`.
 *
 * Runs once the Vite config is resolved: the favicon is checked against Vite's
 * `public` directory, which is only known then.
 */
export async function processConfig(ctx: Context) {
  const { config, root } = ctx
  config.embed = resolveEmbedConfig(config.embed)

  // Resolve files paths

  const resolveFsPath = (file: string, force = false) => {
    if (force || file.startsWith('./') || file.startsWith('../')) {
      return path.resolve(root, file)
    }
    return file
  }

  const fileCheck = (file: string, resolvedFile: string, configPathForError: string) => {
    if (!file.startsWith('http') && !file.startsWith('@') && !fs.existsSync(resolvedFile)) {
      console.warn(pc.yellow(`Histoire config: ${configPathForError} file ${file} does not exist (resolved to ${resolvedFile}), check for typos in the path`))
    }
  }

  config.outDir = resolveFsPath(config.outDir, true)

  // Theme

  if (config.theme?.logo?.square) {
    const file = config.theme.logo.square
    config.theme.logo.square = resolveFsPath(file)
    fileCheck(file, config.theme.logo.square, 'theme.logo.square')
  }

  if (config.theme?.logo?.light) {
    const file = config.theme.logo.light
    config.theme.logo.light = resolveFsPath(file)
    fileCheck(file, config.theme.logo.light, 'theme.logo.light')
  }

  if (config.theme?.logo?.dark) {
    const file = config.theme.logo.dark
    config.theme.logo.dark = resolveFsPath(file)
    fileCheck(file, config.theme.logo.dark, 'theme.logo.dark')
  }

  if (config.theme?.favicon) {
    let file = config.theme.favicon
    if (file.startsWith('/')) {
      file = file.slice(1)
    }
    if (!file.startsWith('http')) {
      const publicDir = path.resolve(ctx.resolvedViteConfig.root, ctx.resolvedViteConfig.publicDir)
      // Resolve URL path
      if (file.startsWith('./') || file.startsWith('../')) {
        const resolvedFile = resolveFsPath(file, true)
        const relativeFile = path.relative(publicDir, resolvedFile)
        if (relativeFile.startsWith('..')) {
          throw new Error(pc.red(`Histoire config: theme.favicon seems to target a file that is not in the vite 'public' directory: ${file} (resolved as ${resolvedFile})`))
        }
        if (!fs.existsSync(resolvedFile)) {
          throw new Error(pc.red(`Histoire config: theme.favicon seems to target a file that does not exist: ${file} (resolved as ${resolvedFile})`))
        }
        config.theme.favicon = relativeFile
      }
      else {
        // Check if URL path is valid
        const resolvedFile = path.resolve(publicDir, file)
        if (!fs.existsSync(resolvedFile)) {
          throw new Error(pc.red(`Histoire config: theme.favicon seems to target a file that does not exist: ${file} (resolved as ${resolvedFile}).\nThe favicon file should be placed in the vite 'public' directory.\nExample: if the file is in <project>/public/img/favicon.ico, you can put 'img/favicon.ico' or './public/img/favicon.ico'.`))
        }
      }
    }
  }
}
