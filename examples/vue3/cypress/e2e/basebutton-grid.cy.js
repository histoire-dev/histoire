/// <reference types="cypress" />

describe('BaseButton grid detection', () => {
  function openBaseButtonStory() {
    cy.visit('/story/src-components-basebutton-story-vue?variantId=src-components-basebutton-story-vue-0')
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
  }

  function selectGridVariant(title, variantId) {
    cy.getPreviewIframeBody().contains('button', title).click({ force: true })
    cy.location('search').should('include', `variantId=${variantId}`)
  }

  function expectDetectedProps(componentCount) {
    cy.get('[data-test-id="story-controls-detected-props"]').should('have.length', componentCount)
  }

  function expectNoDetectedState() {
    cy.get('[data-test-id="story-controls-detected-state"]').should('not.exist')
  }

  beforeEach(() => {
    cy.viewport(1600, 1000)
    openBaseButtonStory()
  })

  it('shows deterministic detected controls for all grid variants', () => {
    cy.location('search').should('include', 'variantId=src-components-basebutton-story-vue-0')
    // The "playground" variant defines a `#controls` slot: those custom
    // controls replace the generic editors for its own state, and the detected
    // props of the rendered component are listed next to them.
    cy.get('[data-test-id="story-controls"]').within(() => {
      cy.contains('label', /^Disabled$/).should('be.visible')
      cy.contains('label', 'Color').should('be.visible')
      cy.contains('label', 'Size').should('be.visible')
    })
    expectDetectedProps(1)
    expectNoDetectedState()

    // The other variants declare neither init state nor controls: only the
    // detected props of the component they render.
    selectGridVariant('big green button', 'src-components-basebutton-story-vue-1')
    expectDetectedProps(1)
    expectNoDetectedState()

    selectGridVariant('small red button', 'src-components-basebutton-story-vue-2')
    expectDetectedProps(1)
    expectNoDetectedState()
  })
})
