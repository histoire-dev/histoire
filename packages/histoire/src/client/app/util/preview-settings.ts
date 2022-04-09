import { reactive } from 'vue'

export interface PreviewSettings {
  responsiveWidth: number
  responsiveHeight: number
  rotate: boolean
  backgroundColor: string
  checkerboard: boolean
}

export const receivedSettings = reactive<PreviewSettings>({} as PreviewSettings)

export function applyPreviewSettings (settings: PreviewSettings) {
  Object.assign(receivedSettings, settings)
}
