/// <reference types="cypress" />

describe('Stories list', () => {
  it('should display the stories', () => {
    cy.clearLocalStorage()
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').should('have.length', 34)
    cy.get('[data-test-id="story-list-item"]').contains('🐱 Meow')
    cy.get('[data-test-id="story-list-item"]').contains('BaseButton').contains('3') // Variants count
    cy.get('[data-test-id="story-list-item"]').contains('Demo')
    cy.get('[data-test-id="story-list-folder"]').should('have.length', 2)
  })

  it('should toggle folder', () => {
    cy.clearLocalStorage()
    cy.visit('/')
    cy.get('[data-test-id="story-list-folder"]').contains('Sub Folder').click()
    cy.get('[data-test-id="story-list-item"]').contains('Sub Story 2')
    cy.get('[data-test-id="story-list-folder"]').contains('Meow').click()
    cy.get('[data-test-id="story-list-item"]').contains('Sub Story 1')
    cy.get('[data-test-id="story-list-folder"]').contains('Meow').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 1')
    cy.get('[data-test-id="story-list-folder"]').contains('Sub Folder').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 2')
  })
})
