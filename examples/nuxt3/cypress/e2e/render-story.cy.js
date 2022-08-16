/// <reference types="cypress" />

describe('Story render', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should display the story content', () => {
    cy.visit('/story/components-simple-story-vue?variantId=_default')
    getIframeBody().contains('Simple story in Nuxt NuxtLink')
  })

  it('should render auto-imported components', () => {
    cy.visit('/story/components-autoimport-story-vue?variantId=_default')
    getIframeBody().contains('Meow')
  })
})
