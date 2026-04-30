/// <reference types="cypress" />

describe('Layout customization', () => {
  beforeEach(() => {
    cy.window().then(w => w.localStorage.removeItem('_histoire-layout-v1'))
    cy.visit('/')
  })

  it('opens the modal via the header button', () => {
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-modal"]').should('be.visible')
    cy.contains('[data-test-id="layout-modal"]', 'Customize Layout')
  })

  it('toggles Story List visibility', () => {
    cy.get('.histoire-base-split-pane').should('exist')
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-toggle-story-list"]').click()
    cy.get('[data-test-id="layout-modal-close"]').click()
    cy.get('.histoire-base-split-pane').should('not.exist')
  })

  it('toggles Story Options visibility on a story', () => {
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
    cy.get('[data-test-id="story-side-panel"]').should('exist')
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-toggle-story-options"]').click()
    cy.get('[data-test-id="layout-modal-close"]').click()
    cy.get('[data-test-id="story-side-panel"]').should('not.exist')
  })

  it('switches Story Options placement to Bottom', () => {
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
    cy.get('[data-test-id="story-side-panel"]').should('exist')
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-placement-bottom"]').click()
    cy.get('[data-test-id="layout-modal-close"]').click()
    cy.get('.histoire-base-split-pane.portrait').should('exist')
  })

  it('persists settings across reload', () => {
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-toggle-story-list"]').click()
    cy.get('[data-test-id="layout-modal-close"]').click()
    cy.reload()
    cy.get('.histoire-base-split-pane').should('not.exist')
  })

  it('hides the Layout button on mobile', () => {
    cy.viewport(375, 667)
    cy.get('[data-test-id="layout-btn"]').should('not.exist')
  })

  it('respects per-story meta.storyOptions override', () => {
    cy.get('[data-test-id="story-list-item"]').contains('StoryOptions Override').click()
    cy.get('[data-test-id="story-side-panel"]').should('not.exist')
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
    cy.get('[data-test-id="story-side-panel"]').should('exist')
  })

  it('closes the modal via backdrop and Esc', () => {
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('[data-test-id="layout-modal"]').should('be.visible')
    cy.get('body').click(10, 10)
    cy.get('[data-test-id="layout-modal"]').should('not.be.visible')
    cy.get('[data-test-id="layout-btn"]').click()
    cy.get('body').type('{esc}')
    cy.get('[data-test-id="layout-modal"]').should('not.be.visible')
  })
})
