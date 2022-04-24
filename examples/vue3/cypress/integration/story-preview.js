/// <reference types="cypress" />

describe('Story preview', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should display the untitled variant', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-test-id="story-variant-list-item"]').should('have.length', 2)
    cy.get('[data-test-id="story-variant-list-item"]').contains('untitled').click()
    cy.get('[data-test-id="story-variant-single-view"]').contains('untitled')
    getIframeBody().contains('Hello world!')
    cy.get('[data-test-id="story-source-code"]').should('have.text', '<Demo message="Hello world!" />')
  })

  it('should display the second variant', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Demo').click()
    cy.get('[data-test-id="story-variant-list-item"]').should('have.length', 2)
    cy.get('[data-test-id="story-variant-list-item"]').contains('Variant 2').click()
    cy.get('[data-test-id="story-variant-single-view"]').contains('Variant 2')
    getIframeBody().contains('Meow!')
    cy.get('[data-test-id="story-source-code"]').should('have.text', '<Demo message="Meow!" />')
  })
})
