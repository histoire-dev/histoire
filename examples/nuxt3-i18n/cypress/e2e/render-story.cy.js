/// <reference types="cypress" />

describe('Story render', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should render auto-imported components', () => {
    cy.visit('/story/components-autoimport-story-vue?variantId=_default')
    getIframeBody().contains('Meow')
  })

  it('should render the public config populated from Nuxt', () => {
    cy.visit('/story/components-autoimport-story-vue?variantId=_default')
    getIframeBody().find('.histoire-generic-render-story p[data-testid="config"]').contains('test')
  })

  it('should render the yes button in French by default', () => {
    cy.visit('/story/components-yesbutton-story-vue?variantId=_default')
    cy.get('.histoire-generic-render-story button[data-testid="base-button"]').contains('Oui')
  })

  it('should be able to switch locale with controls', () => {
    cy.visit('/story/components-nobutton-story-vue?variantId=_default')
    cy.get('.histoire-generic-render-story button[data-testid="base-button"]').contains('Non')
    cy.get('div[data-test-id="story-side-panel"] .histoire-story-controls .histoire-generic-render-story .v-popper').contains('fr').click()
    cy.get('.v-popper__inner').contains('en').click()
    cy.get('.histoire-generic-render-story button[data-testid="base-button"]').contains('No')
  })
})
