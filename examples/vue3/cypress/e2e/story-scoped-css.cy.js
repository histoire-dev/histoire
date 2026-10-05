/// <reference types="cypress" />

import { visitStories } from '../../../cypress/workbench-actions.js'

describe('Story scoped CSS', () => {
  it('applies story-scoped styles inside variant content', () => {
    visitStories()
    cy.get('[data-test-id="story-list-item"]').contains('Story Scoped CSS').click()

    cy.getPreviewIframeBody({ timeout: 15000 }).find('.story-scoped-box').first().should('have.css', 'border-radius', '5px').and('have.css', 'padding-top', '7px').and('have.css', 'padding-right', '11px').and('have.css', 'border-top-color', 'rgb(59, 130, 246)')
  })
})
