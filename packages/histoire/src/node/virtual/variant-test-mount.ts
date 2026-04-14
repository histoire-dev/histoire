import type { HistoireTestRegistration, StoryFile } from '@histoire/shared'
import type { App } from '@histoire/vendors/vue'
import GenericMountStory from '@histoire/app/dist/bundled/components/story/GenericMountStory.vue.js'
import GenericRenderStory from '@histoire/app/dist/bundled/components/story/GenericRenderStory.vue.js'
import FloatingVue from '@histoire/vendors/floating-vue'
import { createPinia } from '@histoire/vendors/pinia'
import { createApp, h, nextTick } from '@histoire/vendors/vue'

/** Maximum time (ms) to wait for the variant to render before aborting. */
const RENDER_TIMEOUT = 15_000

interface MountedRenderVariant {
  story: StoryFile['story']
  variant: StoryFile['story']['variants'][number]
  canvas: HTMLElement
  registrations: HistoireTestRegistration[]
  cleanup: () => void
}

interface BootstrappedVariant {
  registrations: HistoireTestRegistration[]
  cleanup: () => void
}

type WithRegistry = (
  registry: HistoireTestRegistration[],
  testing: boolean,
  fn: () => Promise<void> | void,
) => Promise<void>

/**
 * Mounts the hidden story bootstrap tree and captures any test registrations
 * emitted during setup before the render variant mounts.
 */
export async function bootstrapVariant(
  file: StoryFile,
  variantId: string,
  withRegistry: WithRegistry,
): Promise<BootstrappedVariant> {
  const variant = getVariant(file, variantId)
  const host = createHost()
  const registrations: HistoireTestRegistration[] = []
  const app = createTestApp(() => h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
    story: file.story,
  })]))

  try {
    await withRegistry(registrations, false, async () => {
      app.mount(host)
      await waitForVariantConfig(variant)
      await nextTick()
    })

    return {
      registrations,
      cleanup() {
        cleanupMountedApp(app, host)
      },
    }
  }
  catch (error) {
    cleanupMountedApp(app, host)
    throw error
  }
}

export async function mountRenderVariant(
  file: StoryFile,
  variantId: string,
  withRegistry: WithRegistry,
): Promise<MountedRenderVariant> {
  const variant = getVariant(file, variantId)
  const host = createHost()
  const registrations: HistoireTestRegistration[] = []
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  const app = createTestApp(() => h(GenericRenderStory, {
    class: '__histoire-test-render',
    story: file.story,
    variant,
    onReady: () => resolveReady(),
  }))

  await withRegistry(registrations, true, async () => {
    app.mount(host)
    await Promise.race([
      ready,
      new Promise<void>((_, reject) => setTimeout(
        () => reject(new Error(
          `Timed out waiting ${RENDER_TIMEOUT}ms for histoire variant "${variantId}" `
          + `to render in story "${file.story?.id}". The RenderStory component never emitted "ready".`,
        )),
        RENDER_TIMEOUT,
      )),
    ])
    await nextTick()
  })

  return {
    story: file.story,
    variant,
    canvas: host.querySelector('.__histoire-test-render') ?? host,
    registrations,
    cleanup() {
      cleanupMountedApp(app, host)
    },
  }
}

function getVariant(file: StoryFile, variantId: string) {
  const variant = file.story.variants.find(item => item.id === variantId)
  if (!variant) {
    throw new Error(`Unknown histoire variant "${variantId}" in story "${file.story?.id}"`)
  }
  return variant
}

function createTestApp(render: () => any) {
  const app = createApp({ render })
  app.use(createPinia())
  app.use(FloatingVue, {
    overflowPadding: 4,
    arrowPadding: 8,
    themes: {
      tooltip: { distance: 8 },
      dropdown: { computeTransformOrigin: true, distance: 8 },
    },
  })
  return app
}

function createHost() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

function cleanupMountedApp(app: App<Element>, host: HTMLElement) {
  app.unmount()
  host.remove()
}

async function waitForVariantConfig(variant: StoryFile['story']['variants'][number], timeout = 5000) {
  if (variant.configReady) {
    return
  }

  const start = Date.now()

  while (!variant.configReady) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for histoire variant "${variant.id}" to finish bootstrap.`)
    }

    await new Promise(resolve => window.setTimeout(resolve, 16))
  }
}
