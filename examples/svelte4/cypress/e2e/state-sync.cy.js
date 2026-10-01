/// <reference types="cypress" />

describe('State sync', () => {
  it('should sync state between the controls and the story', () => {
    cy.visit('/story/src-basebutton-story-svelte?variantId=_default')
    // The side panel only renders once the variant booted in the sandbox, so
    // this is what makes the control below reach a live preview.
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody().find('button').should('not.have.class', 'disabled')
    cy.getControlsIframeBody().find('[role="checkbox"]').click()
    cy.getControlsIframeBody().find('pre').contains('"disabled": true')
    cy.getPreviewIframeBody().find('button').should('have.class', 'disabled')
    cy.getPreviewIframeBody().find('input[type="checkbox"]').click()
    cy.getControlsIframeBody().find('pre').contains('"disabled": false')
  })
})
