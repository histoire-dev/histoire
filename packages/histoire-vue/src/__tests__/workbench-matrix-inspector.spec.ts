import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick } from 'vue'
import { inspectorFixture } from './fixtures/matrix-inspector.js'

/** Read semantic prop/value pairs, preserving association within each row. */
function selectedValues(inspector: Awaited<ReturnType<typeof inspectorFixture>>['inspector']) {
  return inspector.findAll('dl dt').map(term => [term.text(), term.element.nextElementSibling?.textContent?.trim()])
}

/** Open the numeric values editor behind the level axis edit action. */
async function openLevel(inspector: Awaited<ReturnType<typeof inspectorFixture>>['inspector']) {
  await inspector.get('button[aria-label="Edit level values"]').trigger('click')
  return inspector.get('[aria-label="level numeric values"]')
}

describe('matrix inspector selected cell', () => {
  it('applies numeric lists and decimal ranges, rejecting incomplete edits atomically', async () => {
    const { matrix, inspector } = await inspectorFixture()
    let editor = await openLevel(inspector)
    await editor.get('input[aria-label="level values"]').setValue('1, 2e0, 2, -0')
    await editor.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(matrix.colAxis.value?.values).toEqual([1, 2, 0])
    expect(matrix.cells.value.map(cell => cell.props.level)).toEqual([1, 2, 0, 1, 2, 0])

    editor = await openLevel(inspector)
    await editor.get('input[aria-label="level values"]').setValue('1,,2')
    await editor.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(editor.get('[role="alert"]').text()).toBe('Enter comma-separated finite numbers')
    expect(matrix.colAxis.value?.values).toEqual([1, 2, 0])

    await editor.findAll('button').find(button => button.text() === 'Range')!.trigger('click')
    await editor.get('input[aria-label="level min"]').setValue('0')
    await editor.get('input[aria-label="level max"]').setValue('0.3')
    await editor.get('input[aria-label="level step"]').setValue('0.1')
    await editor.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(matrix.colAxis.value?.values).toEqual([0, 0.1, 0.2, 0.3])

    editor = await openLevel(inspector)
    await editor.findAll('button').find(button => button.text() === 'Reset values')!.trigger('click')
    expect(matrix.colAxis.value?.values).toEqual([0, 2])
    expect(matrix.cells.value).toHaveLength(4)
  })

  it('discards draft when owning story changes and initializes only uniform ranges', async () => {
    const { matrix, inspector } = await inspectorFixture()
    await (await openLevel(inspector)).get('input[aria-label="level values"]').setValue('99, 100')
    matrix.activate('second', [{ name: 'enabled', values: [false, true] }, { name: 'level', values: [0, 1, 5] }], {})
    await nextTick()
    expect(inspector.find('[aria-label="level numeric values"]').exists()).toBe(false)
    const editor = await openLevel(inspector)
    expect((editor.get('input[aria-label="level values"]').element as HTMLInputElement).value).toBe('0, 1, 5')
    await editor.findAll('button').find(button => button.text() === 'Range')!.trigger('click')
    for (const field of ['min', 'max', 'step']) expect((editor.get(`input[aria-label="level ${field}"]`).element as HTMLInputElement).value).toBe('')
  })

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
