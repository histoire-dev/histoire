/// <reference types="cypress" />

describe('Detected state pane in grid stories', () => {
  before(() => {
    Cypress.on('uncaught:exception', (error) => {
      if (error.message.includes('A preview test collection is already active.')) {
        return false
      }
    })
  })

  const storyPath = '/story/src-components-detectedstatepane-story-vue?variantId=src-components-detectedstatepane-story-vue-0'

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

  /**
   * Asserts visible detected state item count for selected variant.
   */
  function expectDetectedStateCount(count) {
    cy.get('[data-test-id="story-controls"]').within(() => {
      cy.contains('State').parents('.histoire-controls-component-init-state').find('.histoire-controls-component-prop-item').should('have.length', count)
    })
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
  })

  it('shows selected variant detected state for first, middle, and last grid variants', () => {
    expectDetectedStateCount(1)
    cy.get('[data-test-id="story-controls"]').contains('label')

    selectGridVariant('two fields', 'src-components-detectedstatepane-story-vue-1')
    expectDetectedStateCount(2)
    cy.get('[data-test-id="story-controls"]').contains('label')
    cy.get('[data-test-id="story-controls"]').contains('enabled')

    selectGridVariant('three fields', 'src-components-detectedstatepane-story-vue-2')
    expectDetectedStateCount(3)
    cy.get('[data-test-id="story-controls"]').contains('label')
    cy.get('[data-test-id="story-controls"]').contains('enabled')
    cy.get('[data-test-id="story-controls"]').contains('count')
  })
})
