/// <reference types="cypress" />

const describeVisual = Cypress.env('workbenchMode') === 'dev' ? describe : describe.skip

describeVisual('Visual tests workbench', () => {
  it('compares tracked canonical and Matrix baselines and restores keyboard focus after review', () => {
    cy.viewport(1440, 1000)
    cy.visit('/story/visual-card?variantId=default')
    cy.getPreviewIframeBody().find('svg').should('be.visible')
    cy.get('[aria-label="Workbench"] [aria-label^="Tests"]').click()
    cy.contains('[aria-label="Test type"] button', /^Visual$/).click()
    cy.contains('[aria-label="Visual tests"] button', /^\s*Run all\s*$/).click()
    cy.contains('[aria-label="Visual tests"] [role="status"]', '8 passed', { timeout: 90000 }).should('be.visible')
    cy.contains('[aria-label="Visual results filter"] button', /^All$/).click()
    cy.get('[aria-label="Visual tests"] [aria-label^="Review "]').should('have.length', 8).first().as('result').click()
    cy.get('[role="dialog"]').filter(':visible').should('contain', 'Visual card').as('review')
    cy.get('@review').find('img').should(($images) => {
      expect($images).to.have.length(2)
      for (const image of $images) {
        expect(image.naturalWidth).to.equal(320)
        expect(image.naturalHeight).to.equal(240)
      }
    })
    cy.get('@review').contains('[aria-label="Image comparison mode"] button', /^Diff$/).click()
    cy.get('@review').find('img[alt^="diff image"]').should('be.visible')
    cy.focused().trigger('keydown', { key: 'Escape', bubbles: true })
    cy.get('@review').should('not.exist')
    cy.get('@result').should('be.focused')
  })
})
