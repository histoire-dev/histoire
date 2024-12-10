/// <reference types="cypress" />

describe('Setup app (vue3)', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  it('should handle global setup', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=global')
    getIframeBody().contains('42')
  })

  it('should handle local setup', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=local')
    getIframeBody().contains('meow')
  })

  it('should display global components', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=global-component')
    getIframeBody().contains('Global component')
  })
})
