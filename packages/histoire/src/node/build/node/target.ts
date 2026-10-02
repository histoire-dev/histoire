import type { HistoireConfig } from '@histoire/shared'

/** Supported artifact layouts; static preserves historical output. */
export type BuildTarget = 'static' | 'node'

/** Applies explicit CLI override before configured/default deployment target. */
export function resolveBuildTarget(config: Pick<HistoireConfig, 'build'>, override?: string): BuildTarget {
  const target = override ?? config.build?.target ?? 'static'
  if (target !== 'static' && target !== 'node') throw new Error(`Unsupported Histoire build target: ${target}`)
  return target
}
