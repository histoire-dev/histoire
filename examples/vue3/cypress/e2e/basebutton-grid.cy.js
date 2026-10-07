/// <reference types="cypress" />

import { selectCanvasVariant } from '../../../cypress/workbench-actions.js'

describe('BaseButton grid detection', () => {
  /** Opens canonical playground and waits until runtime admits controls. */
  function openBaseButtonStory() {
    cy.visit('/story/src-components-basebutton-story-vue?variantId=src-components-basebutton-story-vue-0')
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody()
  }

  /** Checks detected component count without relying on decorative layout. */
  function expectDetectedProps(componentCount) {
    cy.get('[aria-label="Controls"] fieldset').should('have.length', componentCount)
  }

  function expectNoDetectedState() {
    cy.get('[aria-label="Controls"] .histoire-generic-controls > label').should('not.exist')
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
    cy.getControlsIframeBody().within(() => {
      cy.get('[role="checkbox"][aria-label="Disabled"]').should('be.visible').and('have.attr', 'aria-checked', 'false')
      cy.get('button[aria-label="Color"][aria-haspopup="listbox"]').should('be.visible')
      cy.get('button[aria-label="Size"][aria-haspopup="listbox"]').should('be.visible')
    })
    // Accessible custom controls update the exact selected runtime, not only
    // their own appearance inside the controls replica.
    cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Disabled"]').click().should('have.attr', 'aria-checked', 'true')
    cy.getPreviewIframeBody().contains('button', 'Click me').should('be.disabled')
    cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Disabled"]').click().should('have.attr', 'aria-checked', 'false')
    cy.getPreviewIframeBody().contains('button', 'Click me').should('not.be.disabled')
    expectDetectedProps(1)
    expectNoDetectedState()

    // The other variants declare neither init state nor controls: only the
    // detected props of the component they render.
    selectCanvasVariant('big green button', 'src-components-basebutton-story-vue-1')
    expectDetectedProps(1)
    expectNoDetectedState()

    selectCanvasVariant('small red button', 'src-components-basebutton-story-vue-2')
    expectDetectedProps(1)
    expectNoDetectedState()
  })
})
