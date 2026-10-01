/// <reference types="cypress" />

describe('Story render', () => {
  it('should display the story content', () => {
    cy.visit('/story/src-meow-story-svelte?variantId=src-meow-story-svelte-0')
    cy.getPreviewIframeBody().contains('😺')
  })

  it('should display the story content (grid)', () => {
    cy.visit('/story/src-cars-story-svelte')
    cy.getPreviewIframeBody().find('[data-test-id="sandbox-render"]').contains('🚗')
    cy.getPreviewIframeBody().find('[data-test-id="sandbox-render"]').contains('🏎️')
    cy.getPreviewIframeBody().find('[data-test-id="sandbox-render"]').contains('🚜')
  })
})

describe('Controls render', () => {
  it('should display the controls content', () => {
    cy.visit('/story/src-basebutton-story-svelte?variantId=_default')
    cy.getControlsIframeBody().contains('Disabled')
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
    cy.getControlsIframeBody().contains('Size')
    cy.getControlsIframeBody().should('not.contain', 'Click me!')
  })

  it('should display the controls content (shared controls slot)', () => {
    cy.visit('/story/src-sharecontrols-story-svelte?variantId=src-sharecontrols-story-svelte-0')
    cy.getControlsIframeBody().contains('Disabled')
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
    cy.visit('/story/src-sharecontrols-story-svelte?variantId=src-sharecontrols-story-svelte-1')
    cy.getControlsIframeBody().contains('Disabled')
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
  })

  it('should display the controls content (variant controls slot)', () => {
    cy.visit('/story/src-controlsvariant-story-svelte?variantId=src-controlsvariant-story-svelte-0')
    cy.getControlsIframeBody().contains('Content 1')
    cy.getControlsIframeBody().contains('Disabled 1')
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
    cy.visit('/story/src-controlsvariant-story-svelte?variantId=src-controlsvariant-story-svelte-1')
    cy.getControlsIframeBody().contains('Content 2')
    cy.getControlsIframeBody().contains('Disabled 2')
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
  })
})
