/// <reference types="cypress" />

describe('Auto State & Props grid story', () => {
  const storyPath = '/story/src-components-autostateprops-story-vue?variantId=src-components-autostateprops-story-vue-0'

  /**
   * Selects one variant card from grid iframe.
   */
  function selectGridVariant(title, variantId) {
    cy.getPreviewIframeBody().contains('button', title).click({ force: true })
    cy.location('search').should('include', `variantId=${variantId}`)
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
  })

  it('shows detected state for non-first variants that define init state', () => {
    // "Naked" declares no init state, so only its detected props show up.
    cy.get('[data-test-id="story-controls-detected-state"]').should('not.exist')
    cy.get('[data-test-id="story-controls-detected-props"]').should('be.visible')

    selectGridVariant('State', 'src-components-autostateprops-story-vue-1')

    cy.get('[data-test-id="story-controls-detected-state"]').should('be.visible')
    cy.get('[data-test-id="story-controls-detected-state"]').contains('name').should('be.visible')
  })
})
