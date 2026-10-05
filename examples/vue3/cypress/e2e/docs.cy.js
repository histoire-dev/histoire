/// <reference types="cypress" />

import { selectCanvasVariant, visitStories } from '../../../cypress/workbench-actions.js'

describe('Story docs', () => {
  it('should display the story docs', () => {
    visitStories()
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    selectCanvasVariant('untitled', 'src-components-demo-story-vue-0')
    cy.get('[aria-label="Inspector"] [role="tab"]').contains('Docs').click()
    cy.get('[aria-label="Histoire documentation"] h1').contains('Title 1')
    cy.get('[aria-label="Histoire documentation"] h2').contains('Title 2')
    cy.get('[aria-label="Histoire documentation"] a').contains('Link')
  })
})
