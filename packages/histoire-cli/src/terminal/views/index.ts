import type { TerminalViewFactory } from './registry.js'
import { createClearHistoryView } from './clear-history.js'
import { createErrorView } from './error.js'
import { createHelpView } from './help.js'
import { createLogsView } from './logs.js'
import { createRequestsView } from './requests.js'
import { createSessionView } from './session.js'
import { createStoriesView } from './stories.js'
import { createTestsView } from './tests.js'

/**
 * The only shared list of views: later slices add one import and one entry each.
 * Order is registration order (help text order for views).
 */
export const viewFactories: readonly TerminalViewFactory[] = [createHelpView, createSessionView, createLogsView, createErrorView, createRequestsView, createStoriesView, createTestsView, createClearHistoryView]
