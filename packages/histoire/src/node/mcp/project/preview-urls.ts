import { createStoryUrl, StoryRouteError } from '@histoire/cli/workbench-url'
import { getSandboxRelativeUrl } from '@histoire/shared'
import { McpDomainError } from '../protocol/errors.js'

/** Public URL inputs use trusted server configuration, never caller URLs. */
export interface PreviewUrlOptions {
  /** Actual listened UI origin or configured production public origin. */
  origin: string
  /** Browser deployment base. */
  base: string
  /** Actual UI router mode. */
  routerMode: 'hash' | 'history'
  /** Exact collected story identity. */
  storyId: string
  /** Exact scoped variant identity. */
  variantId: string
}

/** Return UI and sandbox addresses without credentials or browser readiness claims. */
export function createPreviewUrls(options: PreviewUrlOptions) {
  const origin = new URL(options.origin)
  let storyUrl: string
  try {
    storyUrl = createStoryUrl(options)
  }
  catch (error) {
    if (!(error instanceof StoryRouteError)) throw error
    throw new McpDomainError('PREVIEW_NOT_READY', error.reason === 'origin' ? 'Preview origin is unavailable' : 'Preview base must be a same-origin absolute path', true)
  }
  return {
    storyUrl,
    sandboxUrl: new URL(getSandboxRelativeUrl(options), origin.origin).href,
  }
}
