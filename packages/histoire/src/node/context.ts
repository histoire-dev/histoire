import { HistoireConfig } from './config.js'

export interface Context {
  config: HistoireConfig
  mode: 'dev' | 'build'
}
