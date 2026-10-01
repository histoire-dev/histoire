import type { HistoireTestRegistration, StoryFile } from '@histoire/shared'
import type { App } from '@histoire/vendors/vue'
import type { WithRegistry } from './variant-test-session/registry.js'
import GenericMountStory from '@histoire/app/dist/bundled/components/story/GenericMountStory.vue.js'
import GenericRenderStory from '@histoire/app/dist/bundled/components/story/GenericRenderStory.vue.js'
import { createStoryExecutionOwner } from '@histoire/shared'
import FloatingVue from '@histoire/vendors/floating-vue'
import { createPinia } from '@histoire/vendors/pinia'
import { createApp, h, nextTick } from '@histoire/vendors/vue'
import { applyOffscreenHostStyle } from './offscreen-host.js'

interface RenderMountOptions {
  /** Positions the render host off the viewport so it stays invisible to the user. */
  offscreen?: boolean
  /** Maximum time to wait for the render-ready event. */
  timeoutMs: number
}

interface MountedRenderVariant {
  story: StoryFile['story']
  variant: StoryFile['story']['variants'][number]
  canvas: HTMLElement
  registrations: HistoireTestRegistration[]
  /** Story-setup executions caused by this mount (see {@link mountStoryApp}). */
  ownExecutionIds: Set<number>
  cleanup: () => void
}

interface BootstrappedVariant {
  registrations: HistoireTestRegistration[]
  /** Story-setup executions caused by this mount (see {@link mountStoryApp}). */
  ownExecutionIds: Set<number>
  cleanup: () => void
}

/**
 * Mounts a test app and reports the story-setup executions it caused.
 *
 * Ownership follows the DOM subtree, so support plugins can report their real
 * setup executions after asynchronous loading. A synchronous app.mount window
 * only sees the generic wrapper and cannot identify those later story mounts.
 * @param app The test app to mount.
 * @param host Element the app is mounted into.
 */
function mountStoryApp(app: App<Element>, host: HTMLElement) {
  const executions = createStoryExecutionOwner(host)
  app.mount(host)
  return executions
}

/**
 * Mounts the hidden story bootstrap tree and captures any test registrations
 * emitted during setup before the render variant mounts.
 */
export async function bootstrapVariant(
  file: StoryFile,
  variantId: string,
  withRegistry: WithRegistry,
  timeoutMs: number,
): Promise<BootstrappedVariant> {
  const variant = getVariant(file, variantId)
  const host = createHost()
  const registrations: HistoireTestRegistration[] = []
  const app = createTestApp(() => h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
    story: file.story,
  })]))

  let ownExecutionIds = new Set<number>()

  try {
    await withRegistry(registrations, false, async () => {
      ownExecutionIds = mountStoryApp(app, host)
      await waitForVariantConfig(variant, timeoutMs)
      await nextTick()
    })

    return {
      registrations,
      ownExecutionIds,
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
  options: RenderMountOptions,
): Promise<MountedRenderVariant> {
  const variant = getVariant(file, variantId)
  const host = createHost()
  if (options.offscreen) {
    applyOffscreenHostStyle(host)
  }
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

  let ownExecutionIds = new Set<number>()

  try {
    await withRegistry(registrations, true, async () => {
      ownExecutionIds = mountStoryApp(app, host)
      // Capture the timeout handle so it can be cleared once the race settles.
      // Without this, every successful mount leaves a dangling RENDER_TIMEOUT
      // timer alive until it fires.
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          ready,
          new Promise<void>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(
                `Timed out waiting ${options.timeoutMs}ms for histoire variant "${variantId}" `
                + `to render in story "${file.story?.id}". The RenderStory component never emitted "ready".`,
              )),
              options.timeoutMs,
            )
          }),
        ])
      }
      finally {
        // Cleared on both the ready and timeout paths.
        clearTimeout(timeoutHandle)
      }
      await nextTick()
    })
  }
  catch (error) {
    // No caller owns the mount yet when this throws (render timeout, mount
    // error) — unmount here or the app and host stay in the iframe DOM,
    // accumulating one copy per collect/run attempt.
    cleanupMountedApp(app, host)
    throw error
  }

  return {
    story: file.story,
    variant,
    canvas: host.querySelector('.__histoire-test-render') ?? host,
    registrations,
    ownExecutionIds,
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

async function waitForVariantConfig(variant: StoryFile['story']['variants'][number], timeoutMs: number) {
  if (variant.configReady) {
    return
  }

  const start = Date.now()

  while (!variant.configReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for histoire variant "${variant.id}" to finish bootstrap.`)
    }

    await new Promise(resolve => window.setTimeout(resolve, 16))
  }
}
