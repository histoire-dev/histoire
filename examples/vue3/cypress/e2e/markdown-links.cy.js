/// <reference types="cypress" />

describe('Markdown links', () => {
  it('should be just #welcome and not contain attribute target="_blank"', () => {
    cy.visit('/story/src-components-markdownlinks-story-vue?variantId=_default')
    cy.get('#link-to-welcome').should('have.attr', 'href', '#welcome').should('not.have.attr', 'target')
  })

  it('should have target="_blank" set when they external', () => {
    cy.visit('/story/src-components-markdownlinks-story-vue?variantId=_default')
    cy.get('#link-to-history').should('have.attr', 'href', 'https://histoire.dev/').should('have.attr', 'target', '_blank')
  })
})
