/// <reference types="cypress" />

describe('Stories list', () => {
  it('should display all stories', () => {
    cy.clearLocalStorage()
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').should('have.length', 5)
  })
})
