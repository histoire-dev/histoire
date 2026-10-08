import type { MatrixAxis } from '../../../../histoire-app/src/app/util/matrix.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { onTestFinished } from 'vitest'
import { defineComponent, h } from 'vue'
import MatrixInspector from '../../../../histoire-app/src/app/components/canvas/matrix/MatrixInspector.vue'
import { createMatrixStore, provideMatrix } from '../../../../histoire-app/src/app/stores/matrix.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Mount real inspector and local matrix state within an owned SDK session. */
export async function inspectorFixture(options: { axes?: MatrixAxis[], base?: Record<string, unknown>, ready?: boolean } = {}) {
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  const matrix = createMatrixStore()
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  matrix.activate('a:b', options.axes ?? [
    { name: 'enabled', values: [false, true] },
    { name: 'level', values: [0, 2] },
  ], options.base ?? {}, {}, [], undefined, options.ready ?? true)
  const Host = defineComponent({
    setup() {
      provideMatrix(matrix)
      return () => h(MatrixInspector)
    },
  })
  const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(Host) } })
  onTestFinished(async () => {
    wrapper.unmount()
    matrix.close()
    await session.dispose()
  })
  await flushPromises()
  const inspector = wrapper.getComponent(MatrixInspector)
  return { matrix, inspector }
}
