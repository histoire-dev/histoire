import { HistoireSdkError } from '@histoire/protocol'
import { bookBase, loadDescriptor, subscribeSource } from 'virtual:$histoire-local-source'
import { mountStandaloneApp } from './standalone/mount.js'
import './util/vitest-mocker-shim'
import 'virtual:$histoire-vitest-browser-runtime'
import 'virtual:$histoire-theme'

export { default as StoryVariantGridSandbox } from './components/story/StoryVariantGridSandbox.vue'

/** Existing bundle mounts #app; first-party consumers may provide explicit element or selector. */
export function mountMainApp(target: string | HTMLElement = '#app') {
  const container = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!container) throw new HistoireSdkError('INVALID_ARGUMENT', 'Standalone mount target unavailable')
  return mountStandaloneApp({ container, url: new URL(bookBase, container.ownerDocument.defaultView!.location.origin).href, loadDescriptor, subscribe: subscribeSource })
}
