/// <reference types="cypress" />

describe('Story scoped CSS', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]', {
    timeout: 15000,
  })
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  it('applies story-scoped styles inside variant content', () => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Story Scoped CSS').click()

    getIframeBody().find('.story-scoped-box').first().should('have.css', 'border-radius', '5px').and('have.css', 'padding-top', '7px').and('have.css', 'padding-right', '11px').and('have.css', 'border-top-color', 'rgb(59, 130, 246)')
  })
})
