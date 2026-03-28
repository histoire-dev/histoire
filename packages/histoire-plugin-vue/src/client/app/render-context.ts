import type { Variant } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

export interface PreviewRenderContext {
  mode: 'mount' | 'render'
  slotName: string
  currentVariant: Variant | null
  externalState: Variant['state'] | null
  nextVariantIndex: {
    value: number
  }
}

const previewRenderContextKey: InjectionKey<PreviewRenderContext> = Symbol('histoire-preview-render-context')

export function provideRenderContext(value: PreviewRenderContext) {
  provide(previewRenderContextKey, value)
}

export function useRenderContext() {
  return inject(previewRenderContextKey, null)
}
