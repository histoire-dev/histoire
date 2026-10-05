/// <reference types="cypress" />

import { visitStories } from '../../../cypress/workbench-actions.js'

/** Build mode serves collected descriptor through its real immutable asset URL. */
const descriptorUrl = Cypress.env('workbenchMode') === 'dev' ? '/__histoire/local/descriptor.json' : '/assets/histoire-local.json'

describe('Stories list', () => {
  it('should display the stories', () => {
    cy.clearLocalStorage()
    visitStories()
    cy.request(descriptorUrl).its('body.catalog.stories').then((stories) => {
      cy.get('[aria-label="Stories"] .stories-count').should('have.text', `${stories.length} stories`)
    })
    cy.get('[data-test-id="story-list-item"]').contains('Vitest Lifecycle')
    cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking')
    cy.get('[data-test-id="story-list-item"]').contains('🐱 Meow')
    cy.get('[data-test-id="story-list-item"][aria-label="BaseButton"]').should('contain', '3') // Variants count
    cy.get('[data-test-id="story-list-item"]').contains('Demo')
    cy.get('[aria-label="Stories"] input[type="search"]').should('not.exist')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').click()
    cy.get('[aria-label="Search stories, docs and props"]').type('Demo')
    cy.get('[data-test-id="search-item"][data-search-kind="story"]').should('contain', 'Demo')
    cy.get('[aria-label="Workbench"] [aria-label="Stories"]').click()
    cy.get('[data-test-id="story-list-folder"]').should('have.length', 2)
  })

  it('should toggle folder', () => {
    cy.clearLocalStorage()
    visitStories()
    cy.get('[data-test-id="story-list-folder"]').contains('Sub Folder').click()
    cy.get('[data-test-id="story-list-item"]').contains('Sub Story 2')
    cy.get('[data-test-id="story-list-folder"]').contains('Meow').click()
    cy.get('[data-test-id="story-list-item"]').contains('Sub Story 1')
    cy.get('[data-test-id="story-list-folder"]').contains('Meow').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 1')
    cy.get('[data-test-id="story-list-folder"]').contains('Sub Folder').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 2')
  })
})
