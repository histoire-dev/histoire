/// <reference types="cypress" />

describe('Story docs', () => {
  it('should display the story docs', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-test-id="story-variant-list-item"]').contains('untitled').click()
    cy.get('[data-test-id="story-side-panel"] a').contains('Docs').click()
    cy.get('[data-test-id="story-docs"] h1').contains('Title 1')
    cy.get('[data-test-id="story-docs"] h2').contains('Title 2')
    cy.get('[data-test-id="story-docs"] a').contains('Link')
  })
})
