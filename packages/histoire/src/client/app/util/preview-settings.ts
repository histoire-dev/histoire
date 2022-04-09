import { useStorage } from '@vueuse/core'
import { reactive } from 'vue'

export interface PreviewSettings {
  responsiveWidth: number
  responsiveHeight: number
  rotate: boolean
  backgroundColor: string
  checkerboard: boolean
}

const previewSettings = useStorage<PreviewSettings>('_histoire-sandbox-settings-v2', {
  responsiveWidth: 720,
  responsiveHeight: null,
  rotate: false,
  backgroundColor: 'transparent',
  checkerboard: false,
})

export function usePreviewSettings () {
  return previewSettings
}

export const receivedSettings = reactive<PreviewSettings>({} as PreviewSettings)

export function applyPreviewSettings (settings: PreviewSettings) {
  Object.assign(receivedSettings, settings)
}
