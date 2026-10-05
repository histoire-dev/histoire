// ***********************************************
// Custom commands shared by the e2e specs.
//
// More info: https://on.cypress.io/custom-commands
// ***********************************************

import { selectCanvasVariant } from '../../../cypress/workbench-actions.js'
import '../../../cypress/frame-commands.js'

/**
 * Opens the "Vitest Mocking" story on its first variant.
 *
 * A story-only selection shows canvas frames before choosing a canonical
 * preview. Explicit frame chrome also works when a prior variant was remembered.
 */
Cypress.Commands.add('openVitestStory', () => {
  cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking').click()
  cy.location('pathname').should('include', '/story/src-components-vitestmocking-story-vue')
  selectCanvasVariant('mocked module in story setup', 'src-components-vitestmocking-story-vue-0')
  cy.location('search').should('include', 'variantId=src-components-vitestmocking-story-vue-0')
})

/**
 * Asserts the preview shows the greeting produced by the module mocked in the
 * story setup, meaning the Vitest mocker was active when the story ran.
 */
Cypress.Commands.add('assertMockedGreeting', () => {
  // A nested iframe would mean the preview fell back to the sandbox instead of
  // running the story through the Vitest runtime.
  cy.getPreviewIframeBody().find('iframe').should('have.length', 0)
  cy.getPreviewIframeBody().contains('Mocked by Vitest for Vitest browser mode', {
    timeout: 20000,
  })
  cy.getPreviewIframeBody().should('not.contain', 'Failed to resolve vitest:mocks:resolveMock in time')
})
