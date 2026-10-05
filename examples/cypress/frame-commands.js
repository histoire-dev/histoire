/**
 * Yields ready story document using shared explorer's accessible frame title.
 * Cold dev transforms need the same admission budget as existing C1/source checks.
 * @param {object} [options] Options forwarded to `cy.get`, including timeout.
 */
Cypress.Commands.add('getPreviewIframeBody', (options = {}) => cy.get('[aria-busy] iframe[title="Histoire preview"]', { timeout: 20000, ...options })
  .should('be.visible')
  // Story DOM may paint before framework readiness admits runtime input.
  .should(($frames) => {
    expect($frames[0].closest('[aria-busy]'), 'owning preview readiness').to.have.attr('aria-busy', 'false')
  })
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
