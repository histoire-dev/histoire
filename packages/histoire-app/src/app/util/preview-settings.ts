import { reactive } from 'vue'
import type { PreviewSettings } from '../types'

export const receivedSettings = reactive<PreviewSettings>({} as PreviewSettings)

export function applyPreviewSettings (settings: PreviewSettings) {
  Object.assign(receivedSettings, settings)

  document.documentElement.setAttribute('dir', settings.textDirection)
}
