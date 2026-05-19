import type { PreviewSettings } from '../types'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { histoireConfig } from '../util/config'

const builtinDefaults: PreviewSettings = {
  responsiveWidth: 720,
  responsiveHeight: null,
  rotate: false,
  backgroundColor: 'transparent',
  checkerboard: false,
  textDirection: 'ltr',
}

export const usePreviewSettingsStore = defineStore('preview-settings', () => {
  // Merge built-in defaults with the optional user-supplied
  // `defaultPreviewSettings` from histoire.config.js. Only seeds the
  // localStorage-backed store on first visit; later toolbar changes
  // persist normally and win on subsequent loads.
  const currentSettings = useStorage<PreviewSettings>('_histoire-sandbox-settings-v3', {
    ...builtinDefaults,
    ...histoireConfig.defaultPreviewSettings,
  })

  return {
    currentSettings,
  }
})
