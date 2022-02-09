import { HistoireConfig } from './config.js'
import type { StoryFile } from './types.js'

export interface Context {
  config: HistoireConfig
  mode: 'dev' | 'build'
  storyFiles: StoryFile[]
}
