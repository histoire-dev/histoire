/// <reference types="cypress" />

describe('BaseButton grid detection', () => {
  before(() => {
    Cypress.on('uncaught:exception', (error) => {
      if (error.message.includes('A preview test collection is already active.')) {
        return false
      }
    })
  })

  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  function openBaseButtonStory() {
    cy.visit('/story/src-components-basebutton-story-vue?variantId=src-components-basebutton-story-vue-0')
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
  }

  function selectGridVariant(title, variantId) {
    getIframeBody().contains('button', title).click({ force: true })
    cy.location('search').should('include', `variantId=${variantId}`)
  }

  function expectDetectedState(count) {
    cy.get('[data-test-id="story-controls"]').within(() => {
      cy.contains('State').parents('.histoire-controls-component-init-state').find('.histoire-controls-component-prop-item').should('have.length', count)
    })
  }

  function expectDetectedProps(componentCount) {
    cy.get('[data-test-id="story-controls"]').within(() => {
      cy.get('.histoire-controls-component-props').should('have.length', componentCount)
    })
  }

  function expectNoDetectedState() {
    cy.get('[data-test-id="story-controls"]').contains('State').should('not.exist')
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    openBaseButtonStory()
  })

  it('shows deterministic detected controls for all grid variants', () => {
    cy.location('search').should('include', 'variantId=src-components-basebutton-story-vue-0')
    expectDetectedState(3)
    expectDetectedProps(1)

    selectGridVariant('big green button', 'src-components-basebutton-story-vue-1')
    expectDetectedProps(1)
    expectNoDetectedState()

    selectGridVariant('small red button', 'src-components-basebutton-story-vue-2')
    expectDetectedProps(1)
    expectNoDetectedState()
  })
})
