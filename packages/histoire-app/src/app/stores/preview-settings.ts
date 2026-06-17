import type { PreviewSettings } from '../types'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { histoireConfig } from '../util/config'

export const usePreviewSettingsStore = defineStore('preview-settings', () => {
  const currentSettings = useStorage<PreviewSettings>('_histoire-sandbox-settings-v3', {
    responsiveWidth: 720,
    responsiveHeight: null,
    rotate: false,
    backgroundColor: histoireConfig.defaultBackgroundColor ?? 'transparent',
    checkerboard: false,
    textDirection: 'ltr',
  })

  // useStorage honors its default only on first run; push defaultBackgroundColor
  // again whenever the config value changes, keyed by value so explicit user
  // picks made afterwards stay intact.
  const lastAppliedDefaultBg = useStorage<string>('_histoire-default-bg-applied', '')
  const configBg = histoireConfig.defaultBackgroundColor
  if (configBg && lastAppliedDefaultBg.value !== configBg) {
    currentSettings.value.backgroundColor = configBg
    lastAppliedDefaultBg.value = configBg
  }

  return {
    currentSettings,
  }
})
