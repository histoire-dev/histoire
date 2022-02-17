import { build } from '../build.js'
import { createContext } from '../context.js'

export async function buildCommand () {
  const ctx = await createContext({
    mode: 'build',
  })
  await build(ctx)

  // @TODO remove when https://github.com/vitejs/vite/issues/6815 is fixed
  process.exit(0)
}
