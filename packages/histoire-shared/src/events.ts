/**
 * HMR event emitted by the dev server after a story file has been recollected.
 * Subscribed to by both the host UI and the in-iframe preview runtime so they
 * can refresh state and reload Vitest-mocked stories.
 */
export const STORY_CHANGED_EVENT = 'histoire:story-changed'

/**
 * Payload describing a story file that changed in dev mode.
 */
export interface HistoireStoryChangedPayload {
  storyId: string
  hasVitestMocks: boolean
}
