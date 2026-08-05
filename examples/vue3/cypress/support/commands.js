// ***********************************************
// Custom commands shared by the e2e specs.
//
// More info: https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Yields the body of the preview iframe, waiting until the story rendered
 * something into it.
 */
Cypress.Commands.add('getPreviewIframeBody', () => cy.get('iframe[data-test-id="preview-iframe"]')
  .its('0.contentDocument.body')
  .should('not.be.empty')
  .then(cy.wrap))

/**
 * Opens the "Vitest Mocking" story on its first variant.
 *
 * The story has several variants, so Histoire shows the variant list and picks
 * nothing: only single-variant stories (or a story reopened during the same
 * session) get a `variantId` written to the URL automatically. The variant is
 * therefore clicked explicitly before asserting the deep link.
 */
Cypress.Commands.add('openVitestStory', () => {
  cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking').click()
  cy.contains('[data-test-id="story-variant-list-item"]', 'mocked module in story setup').click()
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
