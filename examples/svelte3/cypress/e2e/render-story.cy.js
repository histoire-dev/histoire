/// <reference types="cypress" />

describe('Story render', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should display the story content (with iframe)', () => {
    cy.visit('/story/src-meow-story-svelte?variantId=src-meow-story-svelte-0')
    getIframeBody().contains('😺')
  })

  it('should display the story content (no iframe)', () => {
    cy.visit('/story/src-noiframe-story-svelte?variantId=_default')
    cy.get('[data-test-id="story-variant-single-view"]').contains('No iframe story content')
  })

  it('should display the story content (grid)', () => {
    cy.visit('/story/src-cars-story-svelte')
    cy.get('[data-test-id="sandbox-render"]').contains('🚗')
    cy.get('[data-test-id="sandbox-render"]').contains('🏎️')
    cy.get('[data-test-id="sandbox-render"]').contains('🚜')
  })
})

describe('Controls render', () => {
  it('should display the controls content', () => {
    cy.visit('/story/src-basebutton-story-svelte?variantId=_default')
    cy.get('[data-test-id="story-controls"]').contains('Disabled')
    cy.get('[data-test-id="story-controls"] [role="checkbox"]').should('be.visible')
    cy.get('[data-test-id="story-controls"]').contains('Size')
  })

  it('should display the controls content (shared controls slot)', () => {
    cy.visit('/story/src-sharecontrols-story-svelte?variantId=src-sharecontrols-story-svelte-0')
    cy.get('[data-test-id="story-controls"]').contains('Disabled')
    cy.get('[data-test-id="story-controls"] [role="checkbox"]').should('be.visible')
    cy.visit('/story/src-sharecontrols-story-svelte?variantId=src-sharecontrols-story-svelte-1')
    cy.get('[data-test-id="story-controls"]').contains('Disabled')
    cy.get('[data-test-id="story-controls"] [role="checkbox"]').should('be.visible')
  })
})
