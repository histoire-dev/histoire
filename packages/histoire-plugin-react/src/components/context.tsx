import type { ServerRunPayload, ServerStory, Story, Variant } from '@histoire/shared'
import type { StoryProps } from '../types.js'
import { createContext, useContext } from 'react'

/** Per-root mode and ownership, never shared between concurrent previews. */
export interface HstContextValue {
  /** Adapter phase. */
  mode: 'collect' | 'mount' | 'render'
  /** Metadata collection payload. */
  collection?: ServerRunPayload
  /** Story being configured or rendered. */
  story?: Story
  /** Story being collected. */
  collectedStory?: ServerStory
  /** Currently selected preview variant. */
  variant?: Variant
  /** Slot requested by Histoire. */
  slotName?: string
  /** Parent declaration supplying inherited defaults. */
  storyProps?: StoryProps<any>
  /** Stable ordinal assigned by Story's declaration traversal. */
  index?: number
  /** Marks implicit default declarations. */
  implicit?: boolean
  /** Await asynchronous state initialization before emitting ready. */
  pending: Promise<unknown>[]
  /** Check captured root ownership after asynchronous setup. */
  isActive: () => boolean
}

/** Internal framework context. */
export const HstContext = createContext<HstContextValue | null>(null)

/** Read adapter context and reject stories used outside Histoire. */
export function useHstContext(): HstContextValue {
  const context = useContext(HstContext)
  if (!context) throw new Error('React Story and Variant must render inside Histoire.')
  return context
}
