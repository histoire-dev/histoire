/// <reference types="cypress" />

describe('Wrapper', () => {
  it('should display the wrapper', () => {
    cy.visit('/story/src-components-meow-story-vue?variantId=src-components-meow-story-vue-0')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story .global-wrapper').should('have.css', 'padding', '4px')
  })

  it('should not style wrapper with story disabling it', () => {
    cy.visit('/story/src-components-wrappermetaonstory-story-vue?variantId=src-components-wrappermetaonstory-story-vue-0')
    cy.getPreviewIframeBody().contains('🙀')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story .global-wrapper').should('not.have.css', 'padding', '4px')
    cy.visit('/story/src-components-wrappermetaonstory-story-vue?variantId=src-components-wrappermetaonstory-story-vue-1')
    cy.getPreviewIframeBody().contains('😼')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story .global-wrapper').should('not.have.css', 'padding', '4px')
  })

  it('should not style wrapper with variant disabling it', () => {
    cy.visit('/story/src-components-wrappermetaonvariant-story-vue?variantId=src-components-wrappermetaonvariant-story-vue-0')
    cy.getPreviewIframeBody().contains('🙀')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story .global-wrapper').should('have.css', 'padding', '4px')
    cy.visit('/story/src-components-wrappermetaonvariant-story-vue?variantId=src-components-wrappermetaonvariant-story-vue-1')
    cy.getPreviewIframeBody().contains('😼')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story .global-wrapper').should('not.have.css', 'padding', '4px')
  })
})
