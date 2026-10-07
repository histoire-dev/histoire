/// <reference types="cypress" />

/** Start from deterministic standalone settings and a single selected variant. */
export function visitSingle(path = '/story/src-components-responsive-story-vue?variantId=src-components-responsive-story-vue-0&arrange=single') {
  cy.viewport(1400, 900)
  cy.visit(path, {
    onBeforeLoad(window) {
      window.localStorage.removeItem('_histoire-sandbox-settings-v3')
      window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ version: 3, zoomByArrange: { single: 'fit', grid: 'fit', list: 'selection', matrix: 'fit' }, tool: 'select', frameBackground: 'transparent' }))
      window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: false, inspectorOpen: false, panelWidth: 280, inspectorWidth: 344 }))
    },
  })
  cy.get('[data-frame-id] iframe').should('be.visible')
  cy.get('[aria-label="Resize viewport width"]').should('be.visible')
}

/** Set fixed logical dimensions through canonical viewport controls. */
export function setSingleViewportSize(width, height) {
  cy.get('button[aria-label="Viewport"]').click()
  cy.get('[aria-label="Custom width"]').clear().type(String(width))
  cy.get('[aria-label="Custom height"]').clear().type(String(height))
  cy.get('form.viewport-custom').submit()
  cy.get('button[aria-label="Viewport"]').click()
  cy.get('[aria-label="Resize viewport width"]').should('have.attr', 'aria-valuenow', String(width))
  cy.get('[aria-label="Resize viewport height"]').should('have.attr', 'aria-valuenow', String(height))
}
