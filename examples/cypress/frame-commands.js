/**
 * Yields exact selected ready frame, including native single-surface hosts.
 * @param {object} [options] Options forwarded to `cy.get`, including timeout.
 */
export function getSelectedPreviewIframe(options = {}) {
  return cy.get('iframe[title="Histoire variant"]', { timeout: 20000, ...options })
    .filter((_, iframe) => {
      const frame = iframe.closest('[data-frame-id]')
      return frame ? frame.classList.contains('is-selected') : Boolean(iframe.closest('[aria-busy]'))
    })
    .should('have.length', 1)
    .should(($frames) => {
      // Loaded story DOM cannot accept input until retained-state restoration finishes.
      expect($frames[0].closest('[aria-busy]'), 'owning preview readiness').to.have.attr('aria-busy', 'false')
    })
    .should('be.visible')
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
