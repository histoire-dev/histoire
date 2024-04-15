/// <reference types="cypress" />

describe('State sync', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should display the story content (with iframe)', () => {
    cy.visit('/story/src-basebutton-story-svelte?variantId=_default')
    getIframeBody().find('button').should('not.have.class', 'disabled')
    cy.get('[data-test-id="story-controls"] [role="checkbox"]').click()
    cy.get('[data-test-id="story-controls"] pre').contains('"disabled": true')
    getIframeBody().find('button').should('have.class', 'disabled')
    getIframeBody().find('input[type="checkbox"]').click()
    cy.get('[data-test-id="story-controls"] pre').contains('"disabled": false')
  })
})
