import { reactive } from 'vue'
import { histoireConfig } from './config'
import type { PreviewSettings } from '../types'

export const receivedSettings = reactive<PreviewSettings>({} as PreviewSettings)

export function applyPreviewSettings (settings: PreviewSettings) {
  Object.assign(receivedSettings, settings)

  // Text direction
  document.documentElement.setAttribute('dir', settings.textDirection)

  // Contrast color
  document.documentElement.style.setProperty('--histoire-contrast-color', getContrastColor(settings))
}

export function getContrastColor (setting: PreviewSettings) {
  return histoireConfig.backgroundPresets.find(preset => preset.color === setting.backgroundColor)?.contrastColor ?? 'unset'
}
