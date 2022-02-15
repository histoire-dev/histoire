import { build } from '../build.js'
import { resolveConfig } from '../config.js'
import { Context } from '../context.js'

export async function buildCommand () {
  const config = await resolveConfig()
  const ctx: Context = {
    config,
    mode: 'build',
    storyFiles: [],
  }
  await build(ctx)

  // @TODO remove when https://github.com/vitejs/vite/issues/6815 is fixed
  process.exit(0)
}
