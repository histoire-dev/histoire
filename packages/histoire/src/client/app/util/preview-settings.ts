import { useStorage } from '@vueuse/core'
import { reactive } from 'vue'

export interface PreviewSettings {
  responsiveWidth: number
  responsiveHeight: number
  rotate: boolean
  backgroundColor: string
  checkerboard: boolean
}

export function usePreviewSettings () {
  return useStorage<PreviewSettings>('_histoire-sandbox-settings-v1', {
    responsiveWidth: 720,
    responsiveHeight: null,
    rotate: false,
    backgroundColor: 'transparent',
    checkerboard: false,
  })
}

export const receivedSettings = reactive<PreviewSettings>({} as PreviewSettings)

export function applyPreviewSettings (settings: PreviewSettings) {
  Object.assign(receivedSettings, settings)
}
