import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import MatrixAvailabilityState from '../../../histoire-app/src/app/components/canvas/matrix/MatrixAvailabilityState.vue'
import { createMatrixStore, provideMatrix } from '../../../histoire-app/src/app/stores/matrix.js'

/** Exercise genuine discovery store and canvas guidance without replacing workbench components. */
function fixture() {
  const matrix = createMatrixStore()
  const failed = ref(false)
  const host = defineComponent({
    /** Share actual reactive matrix backing with rendered state. */
    setup() {
      provideMatrix(matrix)
      return () => h(MatrixAvailabilityState, { failed: failed.value })
    },
  })
  const wrapper = mount(host)
  return { matrix, failed, wrapper }
}

describe('matrix canvas guidance', () => {
  it('replaces loading with detected axis and authoring fix, then clears guidance when cells exist', async () => {
    const { matrix, wrapper } = fixture()
    try {
      matrix.activate('button', [], {}, {}, [], [], false)
      await nextTick()
      expect(wrapper.get('[role="status"]').text()).toBe('Reading prop axes')
      matrix.activate('button', [{ name: 'disabled', values: [false, true] }, { name: 'singleton', values: ['only'] }], {})
      await nextTick()
      expect(wrapper.get('[role="status"]').text()).toContain('Found 1 usable axis: disabled.')
      expect(wrapper.text()).toContain('Each axis needs at least two known values.')
      expect(wrapper.text()).toContain('Declare finite values in Story matrix.axes for another prop.')
      expect(wrapper.text()).not.toContain('singleton')
      matrix.activate('button', [{ name: 'disabled', values: [false, true] }, { name: 'color', values: ['green', 'red'] }], {})
      await nextTick()
      expect(matrix.cells.value).toHaveLength(4)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      matrix.close()
    }
  })

  it('distinguishes discovery failure, completed zero axes, and intentionally empty filters', async () => {
    const { matrix, failed, wrapper } = fixture()
    try {
      failed.value = true
      await nextTick()
      expect(wrapper.get('[role="status"]').text()).toContain('Could not read prop axes')
      expect(wrapper.text()).not.toContain('Reading prop axes')
      failed.value = false
      matrix.activate('text', [], {})
      await nextTick()
      expect(wrapper.get('[role="status"]').text()).toContain('No usable prop axes found.')
      expect(wrapper.text()).toContain('Boolean props are detected automatically; declare other finite values in Story matrix.axes.')
      matrix.activate('text', [{ name: 'enabled', values: [false, true] }, { name: 'emphasized', values: [false, true] }], {})
      matrix.setFilter('rows', [])
      failed.value = true
      await nextTick()
      expect(wrapper.get('[role="status"]').text()).toContain('No values selected')
      expect(wrapper.text()).toContain('Enable row and column values in Props.')
      expect(wrapper.text()).not.toContain('Could not read prop axes')
      matrix.setFilter('rows', [true])
      await nextTick()
      expect(matrix.cells.value).toHaveLength(2)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      matrix.close()
    }
  })
})
