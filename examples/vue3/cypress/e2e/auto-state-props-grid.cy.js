/// <reference types="cypress" />

import { selectCanvasVariant } from '../../../cypress/workbench-actions.js'

describe('Auto State & Props grid story', () => {
  const storyPath = '/story/src-components-autostateprops-story-vue?variantId=src-components-autostateprops-story-vue-0'

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody()
  })

  it('shows detected state for non-first variants that define init state', () => {
    // "Naked" declares no init state, so only its detected props show up.
    cy.get('[aria-label="Controls"] .histoire-generic-controls > label').should('not.exist')
    cy.get('[aria-label="Controls"] fieldset').should('be.visible')

    selectCanvasVariant('State', 'src-components-autostateprops-story-vue-1')

    cy.get('[aria-label="Controls"] .histoire-generic-controls > label').should('be.visible')
    cy.get('[aria-label="Controls"] .histoire-generic-controls > label').contains('name').should('be.visible')
  })
})
