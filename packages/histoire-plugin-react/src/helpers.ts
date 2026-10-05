import type { Story, Variant } from '@histoire/shared'
import type { ComponentType, PropsWithChildren } from 'react'
import type { Root } from 'react-dom/client'

/** Provider component installed around a story tree. */
export type ReactStoryWrapper = ComponentType<PropsWithChildren>

/** Setup payload shared by collection, hidden configuration, and preview roots. */
export interface ReactStorySetupApi {
  /** React root owned by this mount. */
  app: Root
  /** Story metadata, absent during collection. */
  story: Story | null
  /** Selected variant, absent during collection and configuration. */
  variant: Variant | null
  /** Current host-owned globals for isolated story document. */
  globals?: import('@histoire/shared').HistoireGlobals
  /** Add a provider; first registered wrapper is outermost. */
  addWrapper: (component: ReactStoryWrapper) => void
  /** Whether this captured root still owns its mount; absent in manual payloads. */
  isActive?: () => boolean
}

/** Setup may register providers or return one provider directly. */
export type ReactStorySetupHandler = (api: ReactStorySetupApi) => void | ReactStoryWrapper | Promise<void | ReactStoryWrapper>

/** Preserve inferred handler types for setup files. */
export function defineSetupReact(handler: ReactStorySetupHandler): ReactStorySetupHandler {
  return handler
}
