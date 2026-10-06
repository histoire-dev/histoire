import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Extend existing transport fixture with an actual iframe owned by its SDK primary surface. */
export function canvasRuntimeFixture() {
  const source = sourceFixture()
  const mount = source.adapters.mount
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, {
    ...source.adapters,
    mount(context) {
      const surface = mount(context)
      if (context.surface !== 'preview') return surface
      const iframe = document.createElement('iframe')
      iframe.title = 'Histoire preview'
      iframe.src = 'about:blank?documentId=document-1'
      context.container.append(iframe)
      const close = surface.close
      return {
        ...surface,
        /** Runtime teardown removes only its own physical frame. */
        async close() {
          iframe.remove()
          await close()
        },
      }
    },
  })
  return { source, session }
}
