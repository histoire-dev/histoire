import type { PreviewSettings } from '../types'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const usePreviewSettingsStore = defineStore('preview-settings', () => {
  const currentSettings = useStorage<PreviewSettings>('_histoire-sandbox-settings-v3', {
    responsiveWidth: 720,
    responsiveHeight: null,
    rotate: false,
    backgroundColor: 'transparent',
    checkerboard: false,
    textDirection: 'ltr',
  })

  return {
    currentSettings,
  }
})
