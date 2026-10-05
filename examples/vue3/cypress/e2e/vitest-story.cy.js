/// <reference types="cypress" />

import { selectCanvasVariant, visitStories } from '../../../cypress/workbench-actions.js'

describe('Vitest story runtime', () => {
  it('reopens the story without losing the manual Vitest mock state', () => {
    cy.viewport(1600, 1000)
    visitStories()
    cy.openVitestStory()

    cy.assertMockedGreeting()

    cy.get('[data-test-id="story-list-item"]').contains('BaseButton').click()
    cy.location('pathname').should('include', '/story/src-components-basebutton-story-vue')

    cy.openVitestStory()
    cy.assertMockedGreeting()
  })

  it('renders custom controls of a mocked story through the controls sandbox', () => {
    cy.viewport(1600, 1000)
    visitStories()
    cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking').click()
    selectCanvasVariant('mocked with controls', 'src-components-vitestmocking-story-vue-1')

    // The host cannot render the #controls slot of a mocked story itself —
    // it embeds a sandbox iframe that executes the story with mocks active.
    const getControlsBody = () => cy.getControlsIframeBody({ timeout: 20000 })

    getControlsBody().contains('Name', { timeout: 20000 })
    getControlsBody().find('input').should('have.value', 'Histoire')

    // Editing inside the controls sandbox must sync back to the host and
    // through to the preview iframe.
    getControlsBody().find('input').clear()
    getControlsBody().find('input').type('Cypress')

    cy.getPreviewIframeBody().find('[data-test-id="controlled-name"]', { timeout: 10000 }).should('contain', 'Cypress')
  })
})
