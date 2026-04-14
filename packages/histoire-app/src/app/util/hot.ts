/**
 * HMR event emitted by the dev server after a story file has been recollected.
 */
export const STORY_CHANGED_EVENT = 'histoire:story-changed'

/**
 * Payload describing a story file that changed in dev mode.
 */
export interface HistoireStoryChangedPayload {
  storyId: string
  hasVitestMocks: boolean
}
