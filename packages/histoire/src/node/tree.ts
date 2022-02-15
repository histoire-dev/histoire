import { TFile, HistoireConfig } from './config.js'

export function createPath (config: HistoireConfig, file: TFile) {
  if (config.tree.file === 'title') {
    return file.title.split('/')
  }

  if (config.tree.file === 'path') {
    return file.path.split('/')
  }

  return config.tree.file(file)
}
