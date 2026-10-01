/// <reference types="cypress" />

describe('Vitest lifecycle and runtime state', () => {
  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit('/story/src-components-vitestlifecycle-story-vue?variantId=src-components-vitestlifecycle-story-vue-0')
  })

  it('collects module-scope tests and runs soft assertions and setup cleanup', () => {
    cy.get('[data-test-id="story-tests-tab"]').click()
    cy.contains('5 collected', { timeout: 20000 })
    cy.contains('button', 'Run tests').click()
    cy.contains('5/5 passing', { timeout: 20000 })
    // Running again must reuse module registrations without retaining hook resources.
    cy.contains('button', 'Run tests').click()
    cy.contains('5/5 passing', { timeout: 20000 })
  })

  it('preserves callbacks nested in array state after controls replica edits', () => {
    cy.getControlsIframeBody().find('input', { timeout: 20000 }).clear().type('edited')
    cy.getPreviewIframeBody().find('[data-test-id="runtime-label"]').should('have.text', 'edited')
    cy.getPreviewIframeBody().contains('button', 'Call callback').click()
    cy.getPreviewIframeBody().find('[data-test-id="callback-result"]').should('have.text', 'callback preserved')
  })
})
