import type { SvelteStorySetupApi, SvelteStorySetupHandler } from '../helpers.js'
import * as svelte from 'svelte'

type SetupModule = Record<string, unknown>

const setupHookNames = [
  'setupSvelte3',
  'setupSvelte4',
  'setupSvelte5',
] as const

export interface MountedSvelteComponent {
  app: any
  destroy: () => void
}

export interface LegacyStateApi {
  captureState: () => Record<string, any> | null
  injectState: (state: Record<string, any>) => void
}

function loadSvelteModule(moduleId: string) {
  return import(/* @vite-ignore */ moduleId)
}

export async function mountSvelteComponent(
  component: any,
  options: Record<string, any>,
  mode: 'auto' | 'client' | 'server-compat' = 'auto',
): Promise<MountedSvelteComponent> {
  if (mode !== 'server-compat') {
    if (typeof (svelte as any)?.mount === 'function') {
      const app = (svelte as any).mount(component, options)
      return {
        app,
        destroy: () => {
          if (typeof (svelte as any).unmount === 'function') {
            ;(svelte as any).unmount(app)
          }
          else {
            app?.$destroy?.()
          }
        },
      }
    }
  }

  try {
    // eslint-disable-next-line new-cap
    const app = new component(options)
    return {
      app,
      destroy: () => {
        app?.$destroy?.()
      },
    }
  }
  catch (error) {
    const legacyModuleId = ['svelte', 'legacy'].join('/')
    const legacy = await loadSvelteModule(legacyModuleId).catch(() => null)
    if (typeof legacy?.createClassComponent === 'function') {
      const app = legacy.createClassComponent({
        component,
        ...options,
      })
      return {
        app,
        destroy: () => {
          app?.$destroy?.()
        },
      }
    }

    throw error
  }
}

export function getLegacyStateApi(app: any): LegacyStateApi | null {
  if (typeof app?.$capture_state !== 'function' || typeof app?.$inject_state !== 'function') {
    return null
  }

  return {
    captureState: () => app.$capture_state(),
    injectState: (state) => {
      app.$inject_state(state)
    },
  }
}

export async function callSetupFunctions(
  generatedSetup: SetupModule,
  setup: SetupModule,
  setupApi: SvelteStorySetupApi,
  variantSetupApp?: SvelteStorySetupHandler | null,
) {
  for (const hookName of setupHookNames) {
    const generatedHook = generatedSetup[hookName] as SvelteStorySetupHandler | undefined
    if (typeof generatedHook === 'function') {
      await generatedHook(setupApi)
    }

    const setupHook = setup[hookName] as SvelteStorySetupHandler | undefined
    if (typeof setupHook === 'function') {
      await setupHook(setupApi)
    }
  }

  if (typeof variantSetupApp === 'function') {
    await variantSetupApp(setupApi)
  }
}

export function createWrappedComponent(Wrap: any, controlComponent: any) {
  function ProxyWrap(anchorOrOptions: any, props?: any) {
    if (new.target) {
      return new Wrap({
        ...anchorOrOptions,
        props: {
          ...anchorOrOptions?.props,
          controlComponent,
        },
      })
    }

    return Wrap(anchorOrOptions, {
      ...props,
      controlComponent,
    })
  }

  if (Wrap?.element) {
    ProxyWrap.element = Wrap.element
  }

  return ProxyWrap
}
