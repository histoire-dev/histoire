/// <reference types="cypress" />

const describeTests = Cypress.env('workbenchMode') === 'dev' ? describe : describe.skip
const shellStorageKey = '_histoire-ui-shell'
const pane = '[aria-label="tests panel"]'
const watchRow = `${pane} footer label`

/** Opens project Tests with a stable desktop pane width. */
function visitTests() {
  cy.viewport(1600, 1000)
  cy.visit('/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0', {
    onBeforeLoad(window) {
      window.localStorage.setItem(shellStorageKey, JSON.stringify({ pane: 'tests', panelOpen: true, inspectorOpen: false, panelWidth: 280, inspectorWidth: 344 }))
    },
  })
  cy.get(watchRow).should('be.visible')
  cy.get(`${watchRow} input[role="switch"]`).should('not.be.disabled')
}

/** Verifies row hit area follows the complete usable Tests pane width. */
function assertWatchRowFitsPane() {
  cy.get(pane).then(($pane) => {
    const paneBounds = $pane[0].getBoundingClientRect()
    cy.get(watchRow).should(($row) => {
      const rowBounds = $row[0].getBoundingClientRect()
      expect(rowBounds.left).to.be.closeTo(paneBounds.left, 1)
      expect(rowBounds.right).to.be.closeTo(paneBounds.right, 1)
    })
  })
}

describeTests('Project Tests Watch mode', () => {
  it('toggles from row space and tracks side-pane resizing', () => {
    visitTests()
    assertWatchRowFitsPane()
    cy.get(watchRow).click(100, 20)
    cy.get(`${watchRow} input[role="switch"]`).should('be.checked')

    cy.get('[aria-label="Resize side panel"]').focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Home', code: 'Home' })
    assertWatchRowFitsPane()
    cy.get(`${watchRow} input[role="switch"]`).should('be.checked')

    cy.get('[aria-label="Resize side panel"]').focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'End', code: 'End' })
    assertWatchRowFitsPane()
    cy.get(`${watchRow} input[role="switch"]`).should('be.checked')
  })
})
