// @vitest-environment jsdom
import type { Story, Variant } from '@histoire/shared'
import type { Vue3StorySetupHandler } from '../../../../histoire-plugin-vue/src/helpers.js'
import { createRequire } from 'node:module'
import { URL as NodeURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { defineComponent, h, resolveComponent } from 'vue'
import { createPreviewHost } from '../../../../histoire-plugin-vue/src/client/app/host.js'

// Use the real consumer router and its shared user Vue, not the workbench bundle.
const { createMemoryHistory, createRouter } = createRequire(new NodeURL('../../../../histoire-vue/package.json', import.meta.url))('vue-router')

/** Mounts a story's real implicit variant, including its hidden configuration pass. */
async function renderRouterLink(setupApp?: Vue3StorySetupHandler) {
  const el = document.createElement('div')
  document.body.append(el)
  const variant: Variant = { id: '_default', title: 'Default', state: {} }
  const story: Story = { id: 'links', title: 'Links', variants: [variant] }
  story.file = {
    id: 'links',
    supportPluginId: 'vue',
    path: [],
    filePath: 'Links.story.vue',
    source: async () => ({ default: '' }),
    story,
    component: defineComponent({
      render() {
        const link = resolveComponent('RouterLink')
        return h(resolveComponent('Story'), { setupApp }, {
          default: () => h(link, { to: '/destination' }, () => 'Destination'),
        })
      },
    }),
  }
  const host = createPreviewHost({
    name: 'RouterStoryHost',
    el,
    getStory: () => story,
    getVariant: () => variant,
    renderContext: { mode: 'render', slotName: 'default', currentVariant: variant, externalState: variant.state, nextVariantIndex: { value: 0 } },
    configureStory: true,
  })
  const warnings = vi.spyOn(console, 'warn')
  try {
    await host.mount()
    const link = el.querySelector('a')
    expect(link?.textContent).toBe('Destination')
    expect(warnings.mock.calls.flat().join('\n')).not.toMatch(/\[Vue warn\]:[^\n]*RouterLink/i)
    return link?.getAttribute('href')
  }
  finally {
    warnings.mockRestore()
    host.unmount()
    el.remove()
  }
}

it('renders RouterLink without a router by using the story fallback', async () => {
  expect(await renderRouterLink()).toBeNull()
})

it.each(['setupApp', 'beforeMount'] as const)('uses the real router without duplicate registration in %s', async (stage) => {
  const href = await renderRouterLink(({ app, hooks }) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }, { path: '/destination', component: {} }],
    })
    const install = () => {
      app.use(router)
    }
    if (stage === 'beforeMount') hooks.onBeforeMount(install)
    else install()
  })
  expect(href).toBe('/destination')
})
