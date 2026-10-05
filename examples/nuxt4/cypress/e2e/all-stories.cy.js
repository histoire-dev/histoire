/// <reference types="cypress" />

import { visitStories } from '../../../cypress/workbench-actions.js'

describe('Stories list', () => {
  it('should display all stories', () => {
    cy.clearLocalStorage()
    visitStories()
    cy.get('[data-test-id="story-list-item"]').should('have.length', 5)
  })
})
