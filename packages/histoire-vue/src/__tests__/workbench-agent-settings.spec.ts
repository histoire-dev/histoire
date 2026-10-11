import type { UiAgentRegistry, UiAgentSettings, UiAgentsSnapshot } from '@histoire/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import AgentsSection from '../../../histoire-app/src/app/components/pages/settings/AgentsSection.vue'
import { createAgentsStore, provideAgentsStore } from '../../../histoire-app/src/app/stores/agents.js'

vi.mock('virtual:$histoire-config', () => ({ config: { theme: {} }, logos: {} }))

/**
 * Server-like remote boundary holds or refuses commands without replacing store behavior.
 * @param automatic Whether each accepted command receives a queued snapshot.
 * @param acceptsCommands Whether transport accepts outgoing settings commands.
 */
function settingsHost(automatic = true, acceptsCommands = true) {
  let snapshot: (value: UiAgentsSnapshot) => void = () => {}
  let disconnected: () => void = () => {}
  const commands: UiAgentSettings[] = []
  const catalog: UiAgentRegistry = { status: { state: 'fresh' }, entries: [{ id: 'other', name: 'Other Agent', icon: 'https://cdn.agentclientprotocol.com/registry/v1/latest/other.svg', command: 'npx', args: ['--yes', 'other@1'], available: true }] }
  const agents = createAgentsStore({
    send(event, value) {
      if (event === 'histoire:ui:agents-configure') {
        commands.push(structuredClone(value as UiAgentSettings))
        if (!acceptsCommands) return false
        if (automatic) queueMicrotask(() => acknowledge())
      }
      return true
    },
    snapshot(callback) {
      snapshot = callback
      return () => {}
    },
    permission: () => () => {},
    resolved: () => () => {},
    disconnect(callback) {
      disconnected = callback
      return () => {}
    },
    environment: async () => {},
    registry: async () => catalog,
    configOptions: async agentId => ({ agentId, model: { configId: 'model', currentValue: 'small', options: [{ value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }] }, effort: { configId: 'effort', currentValue: 'quick', options: [{ value: 'quick', label: 'Quick' }] } }),
  })
  /** Publishes either submitted settings or a rejected write with unchanged preferences. */
  function acknowledge(error?: string): void {
    snapshot({ ...agents.state.value, ...(error ? {} : commands.at(-1)), error })
  }
  snapshot({ enabled: true, enabledIds: ['fake'], presets: [{ id: 'fake', name: 'Fake', command: '/original/command', default: true, effort: 'quick' }], agents: [], permissions: { fileEdits: 'ask', terminal: 'ask' }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } })
  const host = defineComponent({ setup() {
    provideAgentsStore(agents)
    return () => h(AgentsSection)
  } })
  return { agents, host, commands, acknowledge, publish: snapshot, disconnect: () => disconnected() }
}

describe('simplified agent settings', () => {
  it('expands exact created row and clears excluding search only after acknowledgement', async () => {
    const { agents, host, commands, acknowledge, publish } = settingsHost(false)
    const wrapper = mount(host)
    try {
      await expect.poll(() => agents.catalogLoaded.value).toBe(true)
      publish({ ...agents.state.value, presets: [...agents.state.value.presets, { id: 'existing-new', name: 'New agent', command: '/custom' }] })
      await nextTick()
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      await wrapper.findAll('button').find(button => button.text() === 'Add agent')!.trigger('click')
      const id = commands[0].presets.at(-1)!.id
      expect(agents.pending.value).toBe(true)
      expect(agents.state.value.presets.map(preset => preset.id)).toEqual(['fake', 'existing-new'])
      expect((wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('Other')
      expect(wrapper.find('article[aria-label="New agent"]').exists()).toBe(false)

      acknowledge()
      await expect.poll(() => (wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('')
      expect(wrapper.get(`[data-agent-id="${id}"]`).attributes('aria-label')).toBe('New agent')
      const details = wrapper.get(`[data-agent-id="${id}"] details`).element as HTMLDetailsElement
      expect(details.open).toBe(true)
      expect((wrapper.get('[data-agent-id="existing-new"] details').element as HTMLDetailsElement).open).toBe(false)
      expect(agents.state.value.enabledIds).toEqual(['fake'])

      details.open = false
      publish({ ...agents.state.value })
      await nextTick()
      expect(details.open).toBe(false)
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      publish({ ...agents.state.value })
      await nextTick()
      expect((wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('Other')
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it('preserves search on rejection and reveals a later successful creation', async () => {
    const { agents, host, acknowledge } = settingsHost(false)
    const wrapper = mount(host)
    try {
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      const add = wrapper.findAll('button').find(button => button.text() === 'Add agent')!
      await add.trigger('click')
      acknowledge('Cannot save agents')
      await nextTick()
      expect((wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('Other')
      expect(agents.state.value.presets.map(preset => preset.id)).toEqual(['fake'])
      expect(wrapper.get('[role="alert"]').text()).toBe('Cannot save agents')
      await add.trigger('click')
      acknowledge()
      await expect.poll(() => (wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('')
      expect(wrapper.get('article[aria-label="New agent"]').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it.each(['refused', 'disconnected'] as const)('discards reveal after %s transport even if requested ID later appears', async (failure) => {
    const { agents, host, acknowledge, disconnect } = settingsHost(false, failure !== 'refused')
    const wrapper = mount(host)
    try {
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      await wrapper.findAll('button').find(button => button.text() === 'Add agent')!.trigger('click')
      if (failure === 'disconnected') disconnect()
      await nextTick()
      acknowledge()
      await nextTick()
      expect((wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement).value).toBe('Other')
      expect(wrapper.find('article[aria-label="New agent"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it('ignores acknowledgement after settings unmount while store remains active', async () => {
    const { agents, host, acknowledge } = settingsHost(false)
    const wrapper = mount(host, { attachTo: document.body })
    try {
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      await wrapper.findAll('button').find(button => button.text() === 'Add agent')!.trigger('click')
      const search = wrapper.get('[aria-label="Search agents"]').element as HTMLInputElement
      wrapper.unmount()
      acknowledge()
      await nextTick()
      expect(agents.state.value.presets).toHaveLength(2)
      expect(search.value).toBe('Other')
      expect(search.isConnected).toBe(false)
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it('keeps toggle and defaults outside collapsed details, preserves drafts and saves model-dependent defaults', async () => {
    const { agents, host } = settingsHost()
    const wrapper = mount(host, { attachTo: document.body })
    try {
      await expect.poll(() => wrapper.find('[aria-label="Fake model"]').attributes('disabled')).toBeUndefined()
      const row = wrapper.get('article[aria-label="Fake"]')
      expect(row.get('details').attributes('open')).toBeUndefined()
      expect(row.get('[aria-label="Enable Fake"]').element.closest('details')).toBeNull()
      expect(row.get('[aria-label="Fake model"]').element.closest('details')).toBeNull()
      row.get('details').element.setAttribute('open', '')
      await row.get('[aria-label="Fake name"]').setValue('Draft name')
      row.get('details').element.removeAttribute('open')
      row.get('details').element.setAttribute('open', '')
      expect((row.get('[aria-label="Fake name"]').element as HTMLInputElement).value).toBe('Draft name')
      await row.get('[aria-label="Fake model"]').trigger('click')
      await nextTick()
      await expect.poll(() => [...document.querySelectorAll('[role="option"]')].some(element => element.textContent?.trim() === 'Large')).toBe(true)
      const large = [...document.querySelectorAll('[role="option"]')].find(element => element.textContent?.trim() === 'Large') as HTMLElement
      large.click()
      await expect.poll(() => agents.state.value.presets[0].model).toBe('large')
      expect(agents.state.value.presets[0].effort).toBeUndefined()
      expect(agents.state.value.presets[0].command).toBe('/original/command')
      await row.get('[aria-label="Fake command"]').setValue('  ')
      await row.get('form').trigger('submit')
      row.get('details').element.removeAttribute('open')
      expect(row.get('[role="alert"]').text()).toBe('Enter a command')
      expect(row.get('[role="alert"]').element.closest('details')).toBeNull()
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it('enables searched registry agent without opening advanced settings or adding other catalog entries', async () => {
    const { agents, host } = settingsHost()
    const wrapper = mount(host)
    try {
      await expect.poll(() => agents.catalogLoaded.value).toBe(true)
      await wrapper.get('[aria-label="Search agents"]').setValue('Other')
      expect(wrapper.findAll('article').map(row => row.attributes('aria-label'))).toEqual(['Other Agent'])
      const row = wrapper.get('article[aria-label="Other Agent"]')
      expect(row.get('img').attributes('src')).toBe('https://cdn.agentclientprotocol.com/registry/v1/latest/other.svg')
      await row.get('img').trigger('error')
      expect(row.find('img').exists()).toBe(false)
      const toggle = wrapper.get('[aria-label="Enable Other Agent"]')
      await toggle.setValue(true)
      await expect.poll(() => agents.state.value.enabledIds).toEqual(['fake', 'other'])
      expect(agents.state.value.presets).toHaveLength(2)
      expect(agents.state.value.presets[1]).toMatchObject({ id: 'other', registryId: 'other', command: 'npx', args: ['--yes', 'other@1'] })
      expect(agents.state.value.presets[1]).not.toHaveProperty('icon')
      expect(wrapper.get('details').attributes('open')).toBeUndefined()
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })
  it('edits arguments as separate values and only enables save for unsaved changes', async () => {
    const { agents, host } = settingsHost()
    const wrapper = mount(host)
    try {
      const row = wrapper.get('article[aria-label="Fake"]')
      const save = () => row.findAll('button').find(button => button.text() === 'Save')!
      expect(save().attributes('disabled')).toBeDefined()
      const add = row.findAll('button').find(button => button.text() === 'Add argument')!
      await add.trigger('click')
      await row.get('[aria-label="Fake argument 1"]').setValue('--model')
      await add.trigger('click')
      await row.get('[aria-label="Fake argument 2"]').setValue('value with spaces')
      await add.trigger('click')
      expect(save().attributes('disabled')).toBeUndefined()
      await row.get('form').trigger('submit')
      await expect.poll(() => agents.state.value.presets[0].args).toEqual(['--model', 'value with spaces'])
      await expect.poll(() => save().attributes('disabled')).toBeDefined()
      expect(row.get('code').text()).toBe('/original/command --model "value with spaces"')
      await row.get('[aria-label="Remove argument 1"]').trigger('click')
      expect(row.find('[aria-label="Fake argument 2"]').exists()).toBe(false)
      await row.findAll('button').find(button => button.text() === 'Discard')!.trigger('click')
      expect((row.get('[aria-label="Fake argument 2"]').element as HTMLInputElement).value).toBe('value with spaces')
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })

  it('retains registry linkage for rename, detaches explicit command edit and leaves removed agent in catalog', async () => {
    const { agents, host } = settingsHost()
    const wrapper = mount(host)
    try {
      await expect.poll(() => agents.catalogLoaded.value).toBe(true)
      await wrapper.get('[aria-label="Enable Other Agent"]').setValue(true)
      await expect.poll(() => agents.state.value.presets.length).toBe(2)
      const row = wrapper.get('article[aria-label="Other Agent"]')
      row.get('details').element.setAttribute('open', '')
      await row.get('[aria-label="Other Agent name"]').setValue('Renamed')
      await row.get('form').trigger('submit')
      await expect.poll(() => agents.state.value.presets[1].name).toBe('Renamed')
      expect(agents.state.value.presets[1].registryId).toBe('other')
      await row.get('[aria-label="Renamed command"]').setValue('/custom/other')
      await row.get('form').trigger('submit')
      await expect.poll(() => agents.state.value.presets[1].command).toBe('/custom/other')
      expect(agents.state.value.presets[1].registryId).toBeUndefined()
      const remove = row.findAll('button').find(button => button.text() === 'Remove')!
      await remove.trigger('click')
      await expect.poll(() => agents.state.value.presets.length).toBe(1)
      expect(wrapper.find('article[aria-label="Other Agent"]').exists()).toBe(true)
      expect(agents.state.value.enabledIds).toEqual(['fake'])
    }
    finally {
      wrapper.unmount()
      agents.close()
    }
  })
})
