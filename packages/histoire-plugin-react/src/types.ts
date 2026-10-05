import type { StoryProps as SharedStoryProps, VariantProps as SharedVariantProps } from '@histoire/shared'
import type { ReactNode } from 'react'
import type { ReactStorySetupHandler } from './helpers.js'

/** State exposed to both preview content and controls. */
export interface StorySlotProps<S = Record<string, any>> {
  /** Vue reactive variant state; mutations update React subscribers. */
  state: S
}

/** Static content or a render callback receiving shared state. */
export type StoryContent<S = Record<string, any>> = ReactNode | ((props: StorySlotProps<S>) => ReactNode)

/** React variant declaration with optional initial state and controls. */
export interface VariantProps<S = Record<string, any>> extends Omit<SharedVariantProps, 'setupApp'> {
  /** Initialize this variant's state during hidden configuration. */
  initState?: () => S | Promise<S>
  /** Setup callback for this variant's preview and controls roots. */
  setupApp?: ReactStorySetupHandler
  /** Preview content. */
  children?: StoryContent<S>
  /** Controls render callback, overriding story-level controls. */
  controls?: (props: StorySlotProps<S>) => ReactNode
}

/** React story declaration; inherited props supply defaults to variants. */
export interface StoryProps<S = Record<string, any>> extends Omit<SharedStoryProps, 'setupApp'>, VariantProps<S> {}
