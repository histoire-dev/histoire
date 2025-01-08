import type { Context } from '../context.js'
import fs from 'fs-extra'
import { resolve } from 'pathe'

export async function storySource(ctx: Context, id: string) {
  const storyId = id.slice('/__resolved__virtual:story-source:'.length)
  const storyFile = ctx.storyFiles.find(f => f.story?.id === storyId)
  if (storyFile) {
    let source: string
    if (storyFile.virtual) {
      source = storyFile.moduleCode
    }
    else {
      source = await fs.readFile(resolve(ctx.root, storyFile.relativePath), 'utf-8')
    }
    return `export default ${JSON.stringify(source)}`
  }
}
