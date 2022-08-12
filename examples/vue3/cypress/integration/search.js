/// <reference types="cypress" />

describe('Search', () => {
  it('should search stories and variants', () => {
    cy.visit('/')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').type('Demo')
    cy.get('[data-test-id="search-item"]').should('have.length', 4)
    cy.get('[data-test-id="search-item"]').contains('untitled').click()
    cy.get('[data-test-id="story-variant-single-view"]').contains('untitled')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').type('variant 2')
    cy.contains('[data-test-id="search-item"][data-selected]', 'Variant 2')
    cy.get('[data-test-id="search-modal"] input').type('{enter}')
    cy.get('[data-test-id="story-variant-single-view"]').contains('Variant 2')
  })

  it('should handle keyboard navigation', () => {
    cy.visit('/')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').type('Demo')
    cy.contains('[data-test-id="search-item"][data-selected]', 'Demo')
    cy.get('[data-test-id="search-modal"] input').type('{downArrow}{enter}')
    cy.get('[data-test-id="story-variant-single-view"]').contains('untitled')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').clear()
    cy.get('[data-test-id="search-item"]').should('have.length', 0)
    cy.get('[data-test-id="search-modal"] input').type('Demo')
    cy.contains('[data-test-id="search-item"][data-selected]', 'Demo')
    cy.get('[data-test-id="search-modal"] input').type('{downArrow}{downArrow}{enter}')
    cy.get('[data-test-id="story-variant-single-view"]').contains('Variant 2')
  })

  it('should close', () => {
    cy.visit('/')
    // Click on backdrop
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"]').should('be.visible')
    cy.get('body').click(10, 10)
    cy.get('[data-test-id="search-modal"]').should('not.be.visible')
    // Use escape key
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').type('{esc}')
    cy.get('[data-test-id="search-modal"]').should('not.be.visible')
  })

  it('should search docs', () => {
    cy.visit('/')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get('[data-test-id="search-modal"] input').type('welcome')
    cy.get('[data-test-id="search-item"]').should('have.length', 2)
    cy.get('[data-test-id="search-item"]').contains('Introduction')
  })
})
