import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { provideHistoireControls } from '../context'
import { useControlsTheme } from '../utils'
import { getControlsAppearance } from './appearance'

describe('sandbox appearance projection', () => {
  it('keeps neighboring and nested control themes independent', async () => {
    const outer = ref(false)
    const inner = ref(true)
    const neighbor = ref(true)
    const Probe = defineComponent({ setup() {
      const dark = useControlsTheme()
      return () => h('output', String(dark.value))
    } })
    const Scope = defineComponent({ props: ['dark'], setup(props, { slots }) {
      provideHistoireControls({ dark: props.dark, overlay: ref(null) })
      return () => h('section', slots.default?.())
    } })
    const wrapper = mount(defineComponent({ render: () => h('main', [
      h(Scope, { dark: outer }, { default: () => [h(Probe), h(Scope, { dark: inner }, { default: () => h(Probe) })] }),
      h(Scope, { dark: neighbor }, { default: () => h(Probe) }),
    ]) }))
    try {
      expect(wrapper.findAll('output').map(output => output.text())).toEqual(['false', 'true', 'true'])
      inner.value = false
      await nextTick()
      expect(wrapper.findAll('output').map(output => output.text())).toEqual(['false', 'false', 'true'])
    }
    finally { wrapper.unmount() }
  })

  it('projects finite theme/density values from owner without arbitrary story CSS', () => {
    const comfortable = document.createElement('section')
    const compact = document.createElement('section')
    comfortable.style.setProperty('--histoire-control-height', '34px')
    compact.style.setProperty('--histoire-control-height', '28px')
    compact.style.setProperty('--histoire-font-mono', 'JetBrains Mono')
    compact.style.setProperty('--histoire-control-accent', '#7c3aed')
    compact.style.setProperty('--story-private-layout', 'hidden')
    document.body.append(comfortable, compact)
    try {
      const first = getControlsAppearance(comfortable, false)
      const second = getControlsAppearance(compact, true)
      expect(first.properties['--histoire-control-height']).toBe('34px')
      expect(second.properties['--histoire-control-height']).toBe('28px')
      expect(second.properties['--histoire-font-mono']).toBe('JetBrains Mono')
      expect(second.properties['--histoire-control-accent']).toBe('#7c3aed')
      expect(second.properties).not.toHaveProperty('--story-private-layout')
      expect(first.dark).toBe(false)
      expect(second.dark).toBe(true)
    }
    finally {
      comfortable.remove()
      compact.remove()
    }
  })
})
