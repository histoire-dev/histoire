import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { h } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireControlsOverlayHost } from '../overlays/OverlayHost.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

it('exposes finite text tooltip to assistive technology and removes it with owning provider', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const wrapper = mount(HistoireProvider, {
    props: { session },
    attachTo: document.body,
    slots: {
      default: () => h(HistoireControlsOverlayHost, {
        request: { id: 'tooltip', anchor: { x: 0, y: 0, width: 10, height: 10 }, overlay: { kind: 'tooltip', content: '<button>Option</button>' } },
      }),
    },
    global: { stubs: { HistoireTooltip: { template: '<slot name="popper" />' } } },
  })
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('<button>Option</button>'))
    expect(document.querySelector('[role="tooltip"] button')).toBeNull()
    wrapper.unmount()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    expect(session.getSnapshot().status).toBe('ready')
  }
  finally {
    wrapper.unmount()
    await session.dispose()
  }
})
