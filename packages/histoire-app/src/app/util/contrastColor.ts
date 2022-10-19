import { histoireConfig } from './config'
import { usePreviewSettingsStore } from '../stores/preview-settings'
import { watch } from 'vue'
import type { PreviewSettings } from '../types'

export function useContrastColor (element: HTMLElement) {
  const setting = usePreviewSettingsStore().currentSettings
  watch(setting, () => setContrastColor(setting, element), { immediate: true })
}

function setContrastColor (setting: PreviewSettings, element: HTMLElement) {
  const contrastColor = getContrastColor(setting)
  element.style.setProperty('--contrast-color', contrastColor)
}

function getContrastColor (setting: PreviewSettings) {
  return histoireConfig.backgroundPresets.find(preset => preset.color === setting.backgroundColor)?.contrastColor
}
