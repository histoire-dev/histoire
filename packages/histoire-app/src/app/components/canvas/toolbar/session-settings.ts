import type { HistoireSettingsPatch } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'

/** Narrow canonical settings view shared by all toolbar controls. */
export function useCanvasPreviewSettings() {
  const context = useHistoireContext()
  const snapshot = useHistoireSnapshot()
  return {
    snapshot,
    /** Observe rejections through provider error boundary. */
    update(patch: HistoireSettingsPatch): void {
      void context.session.settings.update(patch).catch(context.reportError)
    },
  }
}
