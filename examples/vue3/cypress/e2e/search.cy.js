/// <reference types="cypress" />

/** Opens persistent Search pane through its rail action. */
function openSearch() {
  cy.get('body').then(($body) => {
    // Search remains open after activation; its rail button toggles an already-open pane.
    if (!$body.find('[aria-label="Search stories, docs and props"]').is(':visible')) {
      cy.get('[aria-label="Workbench"] [aria-label="Search"]').click()
    }
  })
  return cy.get('[aria-label="Search stories, docs and props"]').should('be.visible')
}

/** Asserts canvas selection through frame chrome. */
function expectSelectedVariant(title) {
  cy.contains('[data-frame-id] > button[aria-pressed="true"]', title)
}

describe('Search', () => {
  it('should search stories and variants', () => {
    cy.visit('/')
    openSearch().type('Demo')
    cy.get('[aria-label="Search"] [data-test-id="search-item"]').should('have.length.greaterThan', 3)
    cy.contains('[data-test-id="search-item"]:is([data-search-kind="story"], [data-search-kind="variant"])', 'untitled').click()
    expectSelectedVariant('untitled')
    openSearch().clear().type('variant 2')
    cy.contains('[data-test-id="search-item"]:is([data-search-kind="story"], [data-search-kind="variant"])', 'Variant 2')
    cy.get('[aria-label="Search stories, docs and props"]').type('{enter}')
    expectSelectedVariant('Variant 2')
  })

  it('should handle keyboard navigation', () => {
    cy.visit('/')
    openSearch().type('Demo')
    cy.get('[data-test-id="search-item"]:is([data-search-kind="story"], [data-search-kind="variant"])').first().should('contain', 'Demo')
    cy.get('[aria-label="Search stories, docs and props"]').type('{downArrow}{enter}')
    expectSelectedVariant('untitled')
    openSearch().clear().type('Demo')
    cy.get('[data-test-id="search-item"]:is([data-search-kind="story"], [data-search-kind="variant"])').first().should('contain', 'Demo')
    cy.get('[aria-label="Search stories, docs and props"]').type('{downArrow}{downArrow}{enter}')
    expectSelectedVariant('Variant 2')
  })

  it('should close', () => {
    cy.visit('/')
    openSearch()
    cy.get('[data-test-id="search-modal"]').should('be.visible')
    cy.get('[aria-label="Workbench"] [aria-label="Stories"]').click()
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    openSearch().type('{esc}')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').should('be.focused')
  })

  it('should search docs', () => {
    cy.visit('/')
    openSearch().type('welcome')
    cy.get('[data-test-id="search-item"][data-search-kind="docs"]').should('have.length.greaterThan', 0)
    cy.contains('[data-test-id="search-item"][data-search-kind="docs"]', 'Introduction')
  })
})
