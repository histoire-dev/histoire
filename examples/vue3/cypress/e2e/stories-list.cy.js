/// <reference types="cypress" />

import { getTreeStory, visitStories } from '../../../cypress/workbench-actions.js'

/** Build mode serves collected descriptor through its real immutable asset URL. */
const descriptorUrl = Cypress.env('workbenchMode') === 'dev' ? '/__histoire/local/descriptor.json' : '/assets/histoire-local.json'

describe('Stories list', () => {
  it('should display the stories', () => {
    cy.clearLocalStorage()
    visitStories()
    cy.request(descriptorUrl).its('body.catalog.stories').then((stories) => {
      cy.get('[aria-label="Stories"] .stories-count').should('have.text', `${stories.length} stories`)
    })
    // Tree is virtualized: rows near the top are mounted initially, later
    // lookups scroll until their row is mounted.
    cy.get('[data-test-id="story-list-item"]').contains('🐱 Meow')
    getTreeStory('Vitest Lifecycle')
    getTreeStory('Vitest Mocking')
    getTreeStory('BaseButton').should('have.attr', 'aria-label', 'BaseButton').and('contain', '3') // Variants count
    getTreeStory('Demo')
    cy.get('[aria-label="Stories"] input[type="search"]').should('not.exist')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').click()
    cy.get('[aria-label="Search stories, docs and props"]').type('Demo')
    cy.get('[data-test-id="search-item"][data-search-kind="story"]').should('contain', 'Demo')
    cy.get('[aria-label="Workbench"] [aria-label="Stories"]').click()
    // Both folders exist, but the virtual tree may mount only one at a time.
    getTreeStory('events', 'story-list-folder')
    getTreeStory('Sub Folder', 'story-list-folder')
  })

  it('should toggle folder', () => {
    cy.clearLocalStorage()
    visitStories()
    getTreeStory('Sub Folder', 'story-list-folder').click()
    getTreeStory('Sub Story 2')
    getTreeStory('Meow', 'story-list-folder').click()
    getTreeStory('Sub Story 1')
    getTreeStory('Meow', 'story-list-folder').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 1')
    getTreeStory('Sub Folder', 'story-list-folder').click()
    cy.get('[data-test-id="story-list-item"]').should('not.contain', 'Sub Story 2')
  })
})
