/// <reference types="cypress" />

describe('Auto State & Props grid story', () => {
  before(() => {
    Cypress.on('uncaught:exception', (error) => {
      if (error.message.includes('A preview test collection is already active.')) {
        return false
      }
    })
  })

  const storyPath = '/story/src-components-autostateprops-story-vue?variantId=src-components-autostateprops-story-vue-0'

  /**
   * Returns preview iframe body for grid story interactions.
   */
  function getIframeBody() {
    return cy.get('iframe[data-test-id="preview-iframe"]')
      .its('0.contentDocument.body')
      .should('not.be.empty')
      .then(cy.wrap)
  }

  /**
   * Selects one variant card from grid iframe.
   */
  function selectGridVariant(title, variantId) {
    getIframeBody().contains('button', title).click({ force: true })
    cy.location('search').should('include', `variantId=${variantId}`)
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
  })

  it('shows detected state for non-first variants that define init state', () => {
    cy.get('[data-test-id="story-controls"]').contains('State').should('not.exist')

    selectGridVariant('State', 'src-components-autostateprops-story-vue-1')

    cy.get('[data-test-id="story-controls"]').within(() => {
      cy.contains('State').should('be.visible')
      cy.contains('name').should('be.visible')
    })
  })
})
