// @vitest-environment jsdom
import type { TestsService } from '@histoire/plugin-kit'
import type { App } from 'vue'
import { expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { createTestContext, createTestHost } from '../../../histoire-plugin-kit/src/__tests__/fixtures/host.js'
import { PLUGIN_FRAMES_SERVICE } from '../../../histoire-plugin-kit/src/host/frames.js'
import client from '../client.js'

// Real plugin, audit model, panel and host runner; only iframe transport and server tests substitute.
it('opens the audit tab then sends one manual scan to the selected actor', async () => {
  const frame = { key: 'selected', actorId: 'selected-actor', target: { storyId: 'story', variantId: 'one' } }
  const sibling = { key: 'sibling', actorId: 'sibling-actor', target: { storyId: 'story', variantId: 'two' } }
  const messages: Array<{ /** Exact recipient. */ key: string, /** Wire operation. */ type: string }> = []
  const context = Object.assign(createTestContext(), { selection: { target: frame.target } })
  Object.assign(context, { [PLUGIN_FRAMES_SERVICE]: {
    list: () => [sibling, frame],
    subscribe: () => () => {},
    onError: () => () => {},
    open: (_pluginId: string, recipient: typeof frame) => ({
      post: async (type: string) => { messages.push({ key: recipient.key, type }) },
      on: () => () => {},
      getDroppedCount: () => 0,
    }),
  } })
  const host = createTestHost([client], { context })
  let panel: App | undefined
  const container = document.createElement('div')
  try {
    await host.ready
    const tab = host.contributions('inspector.tab')[0]
    expect(tab.primaryCommand).toBe('a11y:run-audit')
    context.navigation.openInspectorTab = (id) => {
      expect(id).toBe('a11y:accessibility')
      if ('component' in tab) {
        panel = createApp({ render: () => h(tab.component, { context: { ...context, frame } }) })
        panel.mount(container)
      }
    }
    expect(host.available('command', context).map(command => command.id)).toContain('a11y:run-audit')
    await host.run('a11y:run-audit', context)
    expect(container.querySelector('[aria-label="Accessibility audit"]')).not.toBeNull()
    expect(messages.filter(message => message.type === 'run')).toEqual([{ key: 'selected', type: 'run' }])
  }
  finally {
    panel?.unmount()
    await host.dispose()
  }
})

it('offers project action only when project tests can run and delegates to their runner', async () => {
  let runs = 0
  let canRun = true
  const listeners = new Set<() => void>()
  const tests: TestsService = {
    entries: () => [],
    running: false,
    progress: null,
    error: null,
    get canRun() { return canRun },
    runAll: async () => { runs++ },
    run: async () => {},
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const context = Object.assign(createTestContext(), { tests })
  context.capabilities = new Set(['tests'])
  const host = createTestHost([{ definition: client, options: { tests: true } }], { context })
  try {
    await host.ready
    expect(host.contributions('shell.pane')[0].primaryCommand).toBe('a11y:run-all')
    expect(host.available('command', context).map(command => command.id)).toContain('a11y:run-all')
    await host.run('a11y:run-all', context)
    expect(runs).toBe(1)
    canRun = false
    for (const listener of listeners) listener()
    expect(host.available('command', context).map(command => command.id)).not.toContain('a11y:run-all')
  }
  finally { await host.dispose() }
})
