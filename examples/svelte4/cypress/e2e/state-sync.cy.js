/// <reference types="cypress" />

describe('State sync', () => {
  it('should sync state between the controls and the story', () => {
    cy.visit('/story/src-basebutton-story-svelte?variantId=_default')
    // Runtime-created controls confirm selected variant is ready before edits.
    cy.getControlsIframeBody().find('[role="checkbox"]').should('be.visible')
    cy.getPreviewIframeBody().find('button').should('not.have.class', 'disabled')
    cy.getControlsIframeBody().find('[role="checkbox"]').click()
    cy.getControlsIframeBody().find('pre').contains('"disabled": true')
    cy.getPreviewIframeBody().find('button').should('have.class', 'disabled')
    cy.getPreviewIframeBody().find('input[type="checkbox"]').click()
    cy.getControlsIframeBody().find('pre').contains('"disabled": false')
  })
})

// Real native clicks must respect disabled state, including event forwarding.
for (const component of ['basebutton', 'colorbutton']) {
  describe(`${component} disabled actions`, () => {
    it('blocks disabled clicks and restores events after enabling', () => {
      cy.visit(`/story/src-${component}-story-svelte?variantId=_default&tab=events`)
      cy.getPreviewIframeBody().contains('button', 'Click me!').click()
      cy.get('[data-test-id="event-item"]').should('have.length', 1)
      cy.getPreviewIframeBody().find('input[type="checkbox"]').check()
      cy.getPreviewIframeBody().contains('button', 'Click me!').should('be.disabled').then(($button) => {
        $button[0].click()
      })
      cy.get('[data-test-id="event-item"]').should('have.length', 1)
      cy.getPreviewIframeBody().find('input[type="checkbox"]').uncheck()
      cy.getPreviewIframeBody().contains('button', 'Click me!').should('not.be.disabled').click()
      cy.get('[data-test-id="event-item"]').should('have.length', 2)
    })
  })
}
