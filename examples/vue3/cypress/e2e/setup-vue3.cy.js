/// <reference types="cypress" />

describe('Setup app (vue3)', () => {
  it('should handle global setup', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=global')
    cy.getPreviewIframeBody().contains('42')
  })

  it('should handle local setup', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=local')
    cy.getPreviewIframeBody().contains('meow')
  })

  it('should display global components', () => {
    cy.visit('/story/src-components-storysetup-story-vue?variantId=global-component')
    cy.getPreviewIframeBody().contains('Global component')
  })
})
