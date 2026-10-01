// ***********************************************
// Custom commands shared by the e2e specs.
//
// More info: https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Yields the body of the preview iframe, waiting until the story rendered
 * something into it.
 *
 * @param {object} [options] Options forwarded to the underlying `cy.get`
 * (a longer `timeout` for stories that are slow to boot, for instance).
 */
Cypress.Commands.add('getPreviewIframeBody', (options = {}) => cy.get('iframe[data-test-id="preview-iframe"]', options)
  .its('0.contentDocument.body')
  .should('not.be.empty')
  .then(cy.wrap))
