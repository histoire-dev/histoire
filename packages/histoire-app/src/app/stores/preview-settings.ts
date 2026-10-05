import type { PreviewSettings } from '../types'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isEmbeddedRuntime } from '../util/dark.js'

export const usePreviewSettingsStore = defineStore('preview-settings', () => {
  const defaults: PreviewSettings = {
    responsiveWidth: 720,
    responsiveHeight: null,
    rotate: false,
    backgroundColor: 'transparent',
    checkerboard: false,
    textDirection: 'ltr',
  }
  const currentSettings = isEmbeddedRuntime ? ref(defaults) : useStorage<PreviewSettings>('_histoire-sandbox-settings-v3', defaults)

  return {
    currentSettings,
  }
})
