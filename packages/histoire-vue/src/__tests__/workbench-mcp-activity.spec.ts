import type { UiMcpOperationInfo } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import McpActivity from '../../../histoire-app/src/app/components/panes/mcp/McpActivity.vue'
import { createMcpStore, provideMcpStore } from '../../../histoire-app/src/app/stores/mcp.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

const channel = vi.hoisted(() => ({ listeners: new Map<string, (value?: any) => void>(), send: vi.fn(() => true) }))

vi.mock('../../../histoire-app/src/app/util/ui-channel.js', () => ({
  onUiEvent: (event: string, listener: (value: any) => void) => {
    channel.listeners.set(event, listener)
    return () => channel.listeners.delete(event)
  },
  onUiDisconnect: (listener: () => void) => {
    channel.listeners.set('disconnect', listener)
    return () => channel.listeners.delete('disconnect')
  },
  sendUiEvent: channel.send,
}))

/** Public operation fixture keeps cancellation capability under server authority. */
function operation(id: string, cancellable: boolean): UiMcpOperationInfo {
  return { id, clientId: 'client', tool: cancellable ? 'histoire_run_tests' : 'histoire_get_docs', target: { storyId: 'story', variantId: 'variant' }, state: 'running', cancellable, startedAt: '2026-10-04T12:00:00.000Z' }
}

afterEach(() => {
  channel.listeners.clear()
  channel.send.mockClear()
})

describe('workbench MCP activity cancellation', () => {
  it('hides Cancel for uncancellable reads and sends exact owned execution identity', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    const store = createMcpStore()
    await session.connect()
    store.connect()
    const Host = defineComponent({
      setup() {
        provideMcpStore(store)
        return () => h(McpActivity)
      },
    })
    const snapshot = channel.listeners.get('histoire:ui:mcp-snapshot')!
    snapshot({ status: 'enabled', clients: [{ id: 'client', name: 'MCP client', transport: 'http', connectedAt: '', lastSeenAt: '' }], operations: [operation('read-id', false)] })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) } })
    try {
      expect(wrapper.find('[aria-label="Cancel operation"]').exists()).toBe(false)
      snapshot({ status: 'enabled', clients: [{ id: 'client', name: 'MCP client', transport: 'http', connectedAt: '', lastSeenAt: '' }], operations: [operation('execution-id', true)] })
      await nextTick()
      const cancel = wrapper.get('[aria-label="Cancel operation"]')
      await cancel.trigger('click')
      expect(channel.send.mock.calls).toContainEqual(['histoire:ui:mcp-cancel', { operationId: 'execution-id' }])
    }
    finally {
      wrapper.unmount()
      store.close()
      await session.dispose()
    }
  })
})
