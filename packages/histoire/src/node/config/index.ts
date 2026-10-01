import type { HistoireConfig } from '@histoire/shared'

export { getDefaultConfig } from './defaults.js'
export { configFileNames, loadConfigFile, resolveConfig, resolveConfigFile } from './load.js'
export { mergeBuildConfig, mergeConfig } from './merge.js'
export { processConfig } from './process.js'

/** Identity helper giving type checking and completion in config files. */
export function defineConfig(config: Partial<HistoireConfig>) {
  return config
}

declare module 'vite' {
  interface UserConfig {
    /**
     * Histoire configuration
     */
    histoire?: Partial<HistoireConfig>
  }
}
