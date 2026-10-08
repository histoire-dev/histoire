/// <reference types="cypress" />

describe('Numeric props matrix', () => {
  beforeEach(() => cy.viewport(1600, 1000))

  it('renders numeric samples, saves range edits across reload, and resets defaults', () => {
    cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId=default&arrange=matrix&rows=enabled&cols=amount', {
      onBeforeLoad(window) { window.localStorage.removeItem('_histoire-ui-matrix/src-components-workbenchmatrix-story-vue') },
    })
    cy.get('[aria-label^="Select matrix cell "]', { timeout: 20000 }).should('have.length', 10)
    cy.get('[aria-label="Zoom level"]').click()
    cy.contains('button', 'Fit to canvas').click()
    cy.get('[aria-label="amount values"][role="group"] button').should(($buttons) => {
      expect([...$buttons].map(button => button.textContent.trim())).to.deep.equal(['0', '1', '2', '5', '10'])
    })
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const values = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]'))
      expect(values.filter(Boolean).length).to.be.greaterThan(0)
      for (const value of values.filter(Boolean)) {
        expect(value.getAttribute('data-amount-type')).to.equal('number')
        expect([0, 1, 2, 5, 10]).to.include(Number(value.getAttribute('data-amount')))
      }
    })

    cy.get('[aria-label="amount numeric values"]').within(() => {
      cy.contains('button', /^Range$/).click()
      cy.get('input[aria-label="amount min"]').type('0')
      cy.get('input[aria-label="amount max"]').type('0.3')
      cy.get('input[aria-label="amount step"]').type('0.1')
      cy.contains('button', /^\s*Apply\s*$/).click()
    })
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 8)
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const amounts = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]')?.getAttribute('data-amount'))
      expect(amounts).to.include('0.1')
      expect(amounts.filter(Boolean).every(amount => ['0', '0.1', '0.2', '0.3'].includes(amount))).to.equal(true)
    })
    cy.reload()
    cy.get('[aria-label^="Select matrix cell "]', { timeout: 20000 }).should('have.length', 8)
    cy.get('input[aria-label="amount values"]').should('have.value', '0, 0.1, 0.2, 0.3')
    cy.get('[aria-label="amount numeric values"]').contains('button', /^\s*Reset values\s*$/).click()
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 10)
    cy.get('input[aria-label="amount values"]').should('have.value', '0, 1, 2, 5, 10')
  })
})
