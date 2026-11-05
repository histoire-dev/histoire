/// <reference types="cypress" />

/** Native marketplace dialog, separate from plugin-owned dialogs. */
const dialog = 'dialog[open][aria-modal="true"]'

/** Use bundled metadata and real workbench navigation; never mutate project packages. */
function openMarketplace() {
  cy.viewport(1440, 1000)
  cy.visit('/settings/plugins', {
    onBeforeLoad(window) {
      window.localStorage.removeItem('_histoire-ui-settings')
    },
  })
  cy.contains('button', 'Browse marketplace').click()
  cy.get(dialog).should('be.visible').and('contain', 'Plugin marketplace')
}

describe('Plugin marketplace', () => {
  it('browses bundled plugins, opens details and returns focus after Escape', () => {
    openMarketplace()
    cy.get(`${dialog} [aria-label="All plugins"]`).click()
    cy.get(`${dialog} [aria-label="Search plugins"]`).type('Percy')
    cy.get(`${dialog} [aria-label="Details for Percy"]`).click()
    for (const tab of ['Overview', 'Options', 'Changelog', 'Versions']) {
      cy.contains(`${dialog} [role="tab"]`, new RegExp(`^${tab}$`)).click().should('have.attr', 'aria-selected', 'true')
      cy.get(`${dialog} [role="tabpanel"]:visible`).should('have.length', 1)
    }
    cy.get(`${dialog} [aria-label="Close marketplace"]`).focus().type('/')
    cy.get(`${dialog} [aria-label="Search plugins"]`).should('be.focused').type('{esc}')
    cy.get(dialog).should('not.exist')
    cy.contains('button', 'Browse marketplace').should('be.focused')
  })

  if (Cypress.env('workbenchMode') !== 'dev') {
    it('provides static manual commands and config instead of starting a job', () => {
      openMarketplace()
      cy.get(`${dialog} [aria-label="All plugins"]`).click()
      cy.get(`${dialog} [aria-label="Search plugins"]`).type('Percy')
      cy.get(`${dialog} [aria-label="Install Percy"]`).click()
      cy.get(dialog).should('contain', 'Manual install').and('contain', 'Static build. Run these steps in your project.')
      cy.get(`${dialog} [role="tabpanel"]:visible`).should('contain', '@histoire/plugin-percy').and('contain', 'HstPercy').and('contain', 'Rebuild with histoire build')
      cy.contains(`${dialog} button`, /^Done$/).click()
      cy.get(dialog).should('not.exist')
    })
  }
})
