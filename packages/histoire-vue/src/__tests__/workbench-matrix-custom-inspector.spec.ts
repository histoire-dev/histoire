import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { inspectorFixture } from './fixtures/matrix-inspector.js'

type Inspector = Awaited<ReturnType<typeof inspectorFixture>>['inspector']

/** Activate named accessible action within real inspector. */
async function click(inspector: Inspector, text: string) {
  const button = inspector.findAll('button').find(button => button.text() === text)
  expect(button, `Missing ${text} action`).toBeDefined()
  await button!.trigger('click')
}

/** Submit new axis through the real form using line-based values. */
async function addAxis(inspector: Inspector, name: string, values: string) {
  await click(inspector, 'Add axis')
  await inspector.get('input[aria-label="Prop name"]').setValue(name)
  await inspector.get('form[aria-label="Add matrix axis"] textarea').setValue(values)
  await inspector.get('form[aria-label="Add matrix axis"]').trigger('submit')
}

describe('custom matrix axis inspector', () => {
  it('cancels new, custom, and numeric drafts without changing saved axes', async () => {
    const { matrix, inspector } = await inspectorFixture()
    await click(inspector, 'Add axis')
    await inspector.get('input[aria-label="Prop name"]').setValue('unfinished')
    await inspector.get('form[aria-label="Add matrix axis"] textarea').setValue('First\nSecond')
    await inspector.get('form[aria-label="Add matrix axis"]').findAll('button').find(button => button.text() === 'Cancel')!.trigger('click')
    expect(inspector.find('form[aria-label="Add matrix axis"]').exists()).toBe(false)
    expect(matrix.customAxes.value.unfinished).toBeUndefined()

    matrix.setCustomAxis('enabled', ['First', 'Second'])
    await nextTick()
    expect(inspector.find('[aria-label="enabled custom values"]').exists()).toBe(false)
    await inspector.get('button[aria-label="Edit enabled values"]').trigger('click')
    const custom = inspector.get('[aria-label="enabled custom values"]')
    expect((custom.get('textarea').element as HTMLTextAreaElement).value).toBe('First\nSecond')
    await custom.get('textarea').setValue('Only')
    await custom.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(custom.get('[role="alert"]').text()).toBe('Enter at least two values, one per line')
    await custom.findAll('button').find(button => button.text() === 'Cancel')!.trigger('click')
    expect(inspector.find('[aria-label="enabled custom values"]').exists()).toBe(false)
    expect(matrix.customAxes.value.enabled).toEqual(['First', 'Second'])

    await inspector.get('button[aria-label="Edit level values"]').trigger('click')
    const numeric = inspector.get('[aria-label="level numeric values"]')
    await numeric.get('input[aria-label="level values"]').setValue('99, 100')
    await numeric.findAll('button').find(button => button.text() === 'Cancel')!.trigger('click')
    expect(inspector.find('[aria-label="level numeric values"]').exists()).toBe(false)
    expect(matrix.cells.value.map(cell => cell.props)).toEqual([
      { enabled: 'First', level: 0 },
      { enabled: 'First', level: 2 },
      { enabled: 'Second', level: 0 },
      { enabled: 'Second', level: 2 },
    ])
  })

  it('creates two axes without metadata, edits values atomically, filters and removes them', async () => {
    const { matrix, inspector } = await inspectorFixture({ axes: [], ready: false })
    await addAxis(inspector, 'item', '{"label":"First"}\n{"label":"Second"}')
    expect(matrix.rows.value).toBe('item')
    await addAxis(inspector, 'list', '[[1],[2]]')
    expect(matrix.cells.value).toHaveLength(4)
    expect(inspector.findAll('button').find(button => button.attributes('title') === '{"label":"First"}')?.text()).toBe('{"label":"First"}')
    await inspector.get('button[aria-label="Edit item values"]').trigger('click')
    const editor = inspector.get('[aria-label="item custom values"]')
    await editor.get('textarea').setValue('[1,]')
    await editor.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(editor.get('[role="alert"]').exists()).toBe(true)
    expect(matrix.cells.value[0].props.item).toEqual({ label: 'First' })
    await editor.get('textarea').setValue('{"label":"Third"}\n{"label":"Fourth"}')
    await editor.findAll('button').find(button => button.text() === 'Apply')!.trigger('click')
    expect(matrix.cells.value[0].props.item).toEqual({ label: 'Third' })
    expect(inspector.find('[aria-label="item custom values"]').exists()).toBe(false)
    await inspector.get('[aria-label="item values"]').get('button').trigger('click')
    expect(matrix.cells.value).toHaveLength(2)
    await inspector.get('button[aria-label="Remove item axis"]').trigger('click')
    expect(matrix.available.value).toBe(false)
    expect(matrix.axes.value.map(axis => axis.name)).toEqual(['list'])
  })

  it('offers known props, edits duplicate names, retains pair, and discards story drafts', async () => {
    const { matrix, inspector } = await inspectorFixture({ base: { message: 'Original' } })
    const previous = [matrix.rows.value, matrix.cols.value]
    await click(inspector, 'Add axis')
    await inspector.get('button[aria-label="Prop"]').trigger('click')
    await expect.poll(() => document.querySelector('[role="listbox"][aria-label="Prop"]')).not.toBeNull()
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.trim() === 'message')
    expect(option).toBeDefined()
    option!.click()
    await nextTick()
    await inspector.get('form[aria-label="Add matrix axis"] textarea').setValue('First\nSecond')
    await inspector.get('form[aria-label="Add matrix axis"]').trigger('submit')
    expect([matrix.rows.value, matrix.cols.value]).toEqual(previous)
    await inspector.get('button[aria-label="Edit message values"]').trigger('click')
    expect(inspector.get('[aria-label="message custom values"]').exists()).toBe(true)
    await addAxis(inspector, 'message', 'Replace\nNo')
    expect(matrix.customAxes.value.message).toEqual(['First', 'Second'])
    expect(inspector.get('[aria-label="message custom values"]').exists()).toBe(true)
    // Canvas guidance opens the same form through shared editor state.
    matrix.axisEditor.add()
    await nextTick()
    await inspector.get('input[aria-label="Prop name"]').setValue('unfinished')
    matrix.activate('other', [], {})
    await nextTick()
    expect(inspector.find('form[aria-label="Add matrix axis"]').exists()).toBe(false)
  })
})
