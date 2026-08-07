/// <reference types="cypress" />

describe('Story preview', () => {
  it('should display the untitled variant', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-test-id="story-variant-list-item"]').should('have.length', 2)
    cy.get('[data-test-id="story-variant-list-item"]').contains('untitled').click()
    cy.get('[data-test-id="story-variant-single-view"]').contains('untitled')
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[data-test-id="story-source-code"]').should('have.text', '<Demo message="Hello world!" />')
  })

  it('should display the second variant', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-test-id="story-variant-list-item"]').should('have.length', 2)
    cy.get('[data-test-id="story-variant-list-item"]').contains('Variant 2').click()
    cy.get('[data-test-id="story-variant-single-view"]').contains('Variant 2')
    cy.getPreviewIframeBody().contains('Meow!')
    cy.get('[data-test-id="story-source-code"]').should('have.text', '<Demo message="Meow!" />')
  })
})
