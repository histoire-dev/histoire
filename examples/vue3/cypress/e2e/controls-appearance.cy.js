/// <reference types="cypress" />

/** Theme updates preserve sandbox document, live drafts and current owning panel appearance. */
describe('Live controls appearance', () => {
  it('updates shared palette in current controls document in both directions', () => {
    cy.clearLocalStorage()
    cy.viewport(1600, 1000)
    cy.visit('/story/src-components-controlsoverlays-story-vue?variantId=src-components-controlsoverlays-story-vue-0')
    cy.getControlsIframeBody({ timeout: 20000 }).then(($body) => {
      const document = $body[0].ownerDocument
      cy.wrap($body).find('input[type="text"]').clear().type('Draft intact')
      cy.get('.histoire-app').invoke('attr', 'data-histoire-appearance').then((initial) => {
        for (const appearance of [initial === 'dark' ? 'light' : 'dark', initial]) {
          cy.get('[aria-label="Toggle dark mode"]').click()
          cy.get('.histoire-app').should('have.attr', 'data-histoire-appearance', appearance)
          cy.get('[aria-label="Controls"] button[aria-label="State preset"]').then(($trigger) => {
            const background = $trigger[0].ownerDocument.defaultView.getComputedStyle($trigger[0]).backgroundColor
            cy.getControlsIframeBody().find('input[type="text"]').should(($input) => {
              expect($input[0].ownerDocument).to.equal(document)
              expect($input.val()).to.equal('Draft intact')
              expect($input.closest('.histoire-wrapper').attr('data-histoire-control-appearance')).to.equal(appearance)
              expect(document.defaultView.getComputedStyle($input[0]).backgroundColor).to.equal(background)
            })
          })
        }
      })
    })
    cy.getPreviewIframeBody().contains('Draft intact')
  })
})
