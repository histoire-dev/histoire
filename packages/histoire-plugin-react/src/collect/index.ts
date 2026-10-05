import type { ServerRunPayload } from '@histoire/shared'
import type { ComponentType } from 'react'
import type { ReactStoryWrapper } from '../helpers.js'
import { createReactHost } from '../util/root.js'
import { callSetupFunctions } from '../util/setup.js'

/** Collect metadata without rendering preview content; always release the root. */
export async function collectStory(component: ComponentType, payload: ServerRunPayload) {
  const host = createReactHost(payload.el)
  const wrappers: ReactStoryWrapper[] = []
  let active = true
  try {
    await callSetupFunctions({
      app: host.app,
      story: null,
      variant: null,
      /** Collection setup owns only this temporary root. */
      isActive: () => active,
      /** Registration must return void, never Array.push's numeric result. */
      addWrapper: (wrapper) => { wrappers.push(wrapper) },
    }, payload.el)
    host.render(component, { mode: 'collect', collection: payload, pending: [], isActive: () => active }, wrappers)
  }
  finally {
    active = false
    host.destroy()
    // React's scheduler can retain a passive-effects task after synchronous
    // unmount. Drain its queued task before worker removes jsdom globals.
    if (typeof setImmediate === 'function') {
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }
}

/** Histoire collection worker entry. */
export async function run(payload: ServerRunPayload) {
  const { default: component } = await import(/* @vite-ignore */ payload.file.moduleId)
  await collectStory(component, payload)
}
