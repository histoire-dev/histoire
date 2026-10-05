/// <reference types="cypress" />

import { selectCanvasVariant } from '../../../cypress/workbench-actions.js'

describe('Detected state pane in grid stories', () => {
  const storyPath = '/story/src-components-detectedstatepane-story-vue?variantId=src-components-detectedstatepane-story-vue-0'

  /**
   * Asserts visible detected state item count for selected variant.
   */
  function expectDetectedStateCount(count) {
    cy.get('[aria-label="Controls"] .histoire-generic-controls > label').should('have.length', count)
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody()
  })

  it('shows selected variant detected state for first, middle, and last grid variants', () => {
    expectDetectedStateCount(1)
    cy.get('[aria-label="Controls"]').contains('label')

    selectCanvasVariant('two fields', 'src-components-detectedstatepane-story-vue-1')
    expectDetectedStateCount(2)
    cy.get('[aria-label="Controls"]').contains('label')
    cy.get('[aria-label="Controls"]').contains('enabled')

    selectCanvasVariant('three fields', 'src-components-detectedstatepane-story-vue-2')
    expectDetectedStateCount(3)
    cy.get('[aria-label="Controls"]').contains('label')
    cy.get('[aria-label="Controls"]').contains('enabled')
    cy.get('[aria-label="Controls"]').contains('count')
  })
})
