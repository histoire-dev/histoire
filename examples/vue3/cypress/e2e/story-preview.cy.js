/// <reference types="cypress" />

import { getGeneratedSource, selectCanvasVariant, visitStories } from '../../../cypress/workbench-actions.js'

describe('Story preview', () => {
  beforeEach(() => {
    visitStories()
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-frame-id] > button').should('have.length', 2)
  })

  it('should display the untitled variant', () => {
    selectCanvasVariant('untitled', 'src-components-demo-story-vue-0')
    cy.contains('[data-frame-id] > button[aria-pressed="true"]', 'untitled')
    // Source helper waits canonical admission after selecting from story-only view.
    getGeneratedSource().should('have.text', '<Demo message="Hello world!" />')
    cy.getPreviewIframeBody().contains('Hello world!')
  })

  it('should display the second variant', () => {
    selectCanvasVariant('Variant 2', 'src-components-demo-story-vue-1')
    cy.contains('[data-frame-id] > button[aria-pressed="true"]', 'Variant 2')
    getGeneratedSource().should('have.text', '<Demo message="Meow!" />')
    cy.getPreviewIframeBody().contains('Meow!')
  })
})
