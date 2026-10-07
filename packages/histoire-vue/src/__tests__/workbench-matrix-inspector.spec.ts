import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, onTestFinished } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import MatrixInspector from '../../../histoire-app/src/app/components/canvas/matrix/MatrixInspector.vue'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Mount real inspector and local matrix state within an owned SDK session. */
async function inspectorFixture() {
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  const matrix = createMatrixStore()
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  matrix.activate('a:b', [
    { name: 'enabled', values: [false, true] },
    { name: 'level', values: [0, 2] },
  ], {})
  const Host = defineComponent({
    setup() {
      provideMatrix(matrix)
      return () => h(MatrixInspector)
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) } })
  onTestFinished(async () => {
    wrapper.unmount()
    matrix.close()
    await session.dispose()
  })
  await flushPromises()
  const inspector = wrapper.getComponent(MatrixInspector)
  return { matrix, inspector }
}

/** Read semantic prop/value pairs, preserving association within each row. */
function selectedValues(inspector: Awaited<ReturnType<typeof inspectorFixture>>['inspector']) {
  return inspector.findAll('dl dt').map(term => [term.text(), term.element.nextElementSibling?.textContent?.trim()])
}

describe('matrix inspector selected cell', () => {
  it('names selected prop values and follows cell changes and axis swaps', async () => {
    const { matrix, inspector } = await inspectorFixture()
    matrix.selectCell(matrix.cells.value[0].key)
    await nextTick()
    expect(selectedValues(inspector)).toEqual([['enabled', 'false'], ['level', '0']])

    matrix.selectCell(matrix.cells.value[3].key)
    await nextTick()
    expect(selectedValues(inspector)).toEqual([['enabled', 'true'], ['level', '2']])

    matrix.swapAxes()
    matrix.selectCell(matrix.cells.value[1].key)
    await nextTick()
    expect(selectedValues(inspector)).toEqual([['level', '0'], ['enabled', 'true']])
  })

  it('clears removed cell values and disables saving when filtered out', async () => {
    const { matrix, inspector } = await inspectorFixture()
    expect(inspector.get('[role="status"]').text()).toBe('No cell selected')
    const save = inspector.findAll('button').find(button => button.text() === 'Save as variant')!
    expect(save.element.disabled).toBe(true)

    const cell = matrix.cells.value[0]
    matrix.selectCell(cell.key)
    const release = matrix.registerSource(cell.key, async () => '<Button />')
    onTestFinished(release)
    await nextTick()
    expect(save.element.disabled).toBe(false)
    expect(inspector.find('[role="status"]').exists()).toBe(false)
    expect(selectedValues(inspector)).toEqual([['enabled', 'false'], ['level', '0']])

    await inspector.get('[role="group"][aria-label="enabled values"]').get('button').trigger('click')
    expect(matrix.selectedCell.value).toBeUndefined()
    expect(selectedValues(inspector)).toEqual([])
    expect(inspector.get('[role="status"]').text()).toBe('No cell selected')
    expect(save.element.disabled).toBe(true)
  })
})
