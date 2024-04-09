import type { Context } from '../context.js'
import { ID_SEPARATOR } from './util.js'

export function resolvedGeneratedSetupCode(ctx: Context, id: string) {
  const [, index] = id.split(ID_SEPARATOR)
  return ctx.config.setupCode?.[index] ?? ''
}
