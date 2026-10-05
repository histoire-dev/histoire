import type { Context } from '../context.js'

export function resolvedConfig(ctx: Context) {
  const { agents, comments, ...publicConfig } = ctx.config
  // Agent environment belongs to user-level process settings. It must never
  // enter a browser module, including development's public virtual config.
  const config = ctx.mode === 'dev'
    ? { ...publicConfig, comments, agents: agents ? { ...agents, presets: agents.presets?.map(({ env: _env, ...preset }) => preset) } : undefined }
    : publicConfig
  let js = `export const config = ${JSON.stringify(config)}\n`
  if (ctx.config.theme?.logo) {
    for (const key in ctx.config.theme.logo) {
      js += `import Logo_${key} from '${ctx.config.theme.logo[key]}'\n`
    }
  }
  js += `export const logos = {${Object.keys(ctx.config.theme?.logo ?? {}).map(key => `${key}: Logo_${key}`).join(', ')}}\n`
  return js
}
