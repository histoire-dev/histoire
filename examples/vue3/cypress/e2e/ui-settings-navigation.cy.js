/// <reference types="cypress" />

import { restoreWorkspacePaneFromSettings } from '../../../cypress/workbench-actions.js'

/** Canonical selected story used to prove route restoration, not selection replay. */
const story = {
  path: '/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0',
  previewText: 'Hello world!',
}
/** Static books expose the first two; development books expose all workspace panes. */
const panes = [
  { label: 'Stories', panel: 'stories' },
  { label: 'Search', panel: 'search' },
  ...(Cypress.env('workbenchMode') === 'dev'
    ? [
        { label: 'Tests', panel: 'tests' },
        { label: 'Comments', panel: 'comments' },
        { label: 'MCP activity', panel: 'MCP activity' },
      ]
    : []),
]

describe('Settings workspace navigation', () => {
  beforeEach(() => cy.viewport(1600, 1000))

  for (const pane of panes) {
    it(`restores selected story before opening ${pane.label}`, () => {
      restoreWorkspacePaneFromSettings({ ...story, ...pane })
    })
  }
})
