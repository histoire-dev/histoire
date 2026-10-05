/**
 * Yields selected retained replica before canonical primary fallback.
 * @param {object} [options] Options forwarded to `cy.get`, including timeout.
 */
export function getSelectedPreviewIframe(options = {}) {
  return cy.get('body', options).then(($body) => {
    const retained = $body.find('.histoire-canvas-frame.is-selected iframe[title="Histoire preview"]')
    if (retained.length) return cy.wrap(retained.eq(0))
    return cy.get('[aria-busy] iframe[title="Histoire preview"]', { timeout: 20000, ...options })
      .should(($frames) => {
        // Story DOM may paint before framework readiness admits runtime input.
        expect($frames[0].closest('[aria-busy]'), 'owning preview readiness').to.have.attr('aria-busy', 'false')
      })
  }).should('be.visible')
}

/**
 * Yields ready selected story document, including retained canvas replicas.
 * @param {object} [options] Options forwarded to `cy.get`, including timeout.
 */
Cypress.Commands.add('getPreviewIframeBody', (options = {}) => getSelectedPreviewIframe(options)
  .its('0.contentDocument.body')
  .should('not.be.empty')
  .then(cy.wrap))

/**
 * Yields visible custom controls document after owning wrapper admits readiness.
 * @param {object} [options] Options forwarded to `cy.get`, including timeout.
 */
Cypress.Commands.add('getControlsIframeBody', (options = {}) => cy.get('iframe[title="Histoire custom controls"]', options)
  // Child DOM can paint inside transparent, non-interactive boot wrapper.
  // Wait real host visibility before yielding it for synthetic Cypress input.
  .should('be.visible')
  .its('0.contentDocument.body')
  .should('not.be.empty')
  .then(cy.wrap))
