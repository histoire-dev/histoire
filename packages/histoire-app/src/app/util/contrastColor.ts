import { histoireConfig } from './config'
import type { PreviewSettings } from '../types'

export function setContrastColor (setting: PreviewSettings) {
  const contrastColor = histoireConfig.backgroundPresets.find(preset => preset.color === setting.backgroundColor)?.contrastColor
  document.documentElement.style.setProperty('--contrast-color', contrastColor)
}
