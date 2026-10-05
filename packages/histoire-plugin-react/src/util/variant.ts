import type { Variant } from '@histoire/shared'
import type { HstContextValue } from '../components/context.js'
import type { ReactStorySetupApi, ReactStorySetupHandler } from '../helpers.js'
import type { VariantProps } from '../types.js'
import { cloneInitialState } from './initial-state.js'

/** Apply inherited configuration and async initial state to one runtime variant. */
export async function configureVariant(variant: Variant, props: VariantProps<any>, context: HstContextValue) {
  const inherited = context.storyProps ?? {}
  const initState = props.initState ?? inherited.initState
  if (initState) {
    const state = await initState()
    if (!context.isActive()) return
    // Initializers may reuse defaults or return a reactive root. Detach their
    // nested data before assigning it to this variant's existing state owner.
    Object.assign(variant.state, cloneInitialState(state, variant.state))
  }
  if (!context.isActive()) return
  const controls = props.controls ?? inherited.controls
  const handlers = [...new Set([inherited.setupApp, props.setupApp].filter(Boolean))] as ReactStorySetupHandler[]
  Object.assign(variant, {
    source: props.source ?? inherited.source,
    responsiveDisabled: props.responsiveDisabled ?? inherited.responsiveDisabled ?? false,
    autoPropsDisabled: props.autoPropsDisabled ?? inherited.autoPropsDisabled ?? false,
    slots: () => ({ default: true, controls: !!controls, source: null }),
    /** Run story setup before variant setup, retaining returned providers. */
    setupApp: handlers.length
      ? async (api: ReactStorySetupApi) => {
        for (const handler of handlers) {
          if (api.isActive?.() === false) return
          const wrapper = await handler(api)
          if (api.isActive?.() === false) return
          if (wrapper) api.addWrapper(wrapper)
        }
      }
      : undefined,
    configReady: true,
  })
  context.story!.meta ??= {}
  Object.assign(context.story!.meta, { hasVariantChildComponents: !context.implicit })
}
