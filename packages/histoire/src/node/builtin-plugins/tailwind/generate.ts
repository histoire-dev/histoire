import type { PluginApiBase } from '@histoire/shared'
import type { TailwindEngine, TailwindSource, TailwindTokensOptions } from './types.js'
import { generateV3 } from './v3.js'
import { generateV4 } from './v4.js'

/** Generate immutable source output; caller retains dependencies even on failure. */
export async function generateTailwindSnapshot(api: PluginApiBase, engine: TailwindEngine, source: TailwindSource, _options: TailwindTokensOptions, dependencies = new Set<string>()) {
  dependencies.add(source.path)
  return engine.major === 3 ? generateV3(api, engine, source) : generateV4(api, engine, source, dependencies)
}
