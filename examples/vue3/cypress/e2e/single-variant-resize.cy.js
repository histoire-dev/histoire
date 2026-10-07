/// <reference types="cypress" />

const story = '/story/src-components-responsive-story-vue?variantId=src-components-responsive-story-vue-0&arrange=single'
const widthHandle = '[aria-label="Resize viewport width"]'
const heightHandle = '[aria-label="Resize viewport height"]'
const cornerHandle = '[data-test-id="single-resize-both"]'

/** Start from deterministic standalone and canvas preferences. */
function visitSingle() {
  cy.viewport(1400, 900)
  cy.visit(story, {
    onBeforeLoad(window) {
      window.localStorage.removeItem('_histoire-sandbox-settings-v3')
      window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ version: 3, zoomByArrange: { single: 'fit', grid: 'fit', list: 'selection', matrix: 'fit' }, tool: 'select', frameBackground: 'transparent' }))
      window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: false, inspectorOpen: false, panelWidth: 280, inspectorWidth: 344 }))
    },
  })
  cy.get('[data-frame-id] iframe').should('be.visible')
  cy.get(widthHandle).should('be.visible')
}

/** Drag one grip through native pointer capture and document listeners. */
function drag(selector, deltaX, deltaY) {
  cy.get(selector).then(($handle) => {
    const rect = $handle[0].getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2
    cy.wrap($handle).trigger('pointerdown', { eventConstructor: 'PointerEvent', pointerId: 41, button: 0, clientX, clientY, force: true })
    cy.document().trigger('pointermove', { eventConstructor: 'PointerEvent', pointerId: 41, button: 0, clientX: clientX + deltaX, clientY: clientY + deltaY, force: true })
    cy.document().trigger('pointerup', { eventConstructor: 'PointerEvent', pointerId: 41, button: 0, clientX: clientX + deltaX, clientY: clientY + deltaY, force: true })
  })
}

describe('single variant resizing', () => {
  it('resizes with pointer and keyboard, retains document, and restores persisted dimensions', () => {
    visitSingle()
    cy.get('[data-frame-id] iframe').then(($iframe) => {
      const iframe = $iframe[0]
      cy.get(widthHandle).invoke('attr', 'aria-valuenow').then(Number).then((initialWidth) => {
        drag(widthHandle, 48, 0)
        cy.get(widthHandle).should('have.attr', 'aria-valuenow', String(initialWidth + 48))
      })
      cy.get(heightHandle).invoke('attr', 'aria-valuenow').then(Number).then((initialHeight) => {
        cy.get(heightHandle).focus().trigger('keydown', { key: 'ArrowDown', shiftKey: true })
        cy.get(heightHandle).should('have.attr', 'aria-valuenow', String(initialHeight + 32))
      })
      cy.get(widthHandle).invoke('attr', 'aria-valuenow').then(Number).then((width) => {
        cy.get(heightHandle).invoke('attr', 'aria-valuenow').then(Number).then((height) => {
          drag(cornerHandle, 24, 16)
          cy.get(widthHandle).should('have.attr', 'aria-valuenow', String(width + 24))
          cy.get(heightHandle).should('have.attr', 'aria-valuenow', String(height + 16))
        })
      })
      cy.get('[data-frame-id] iframe').should($current => expect($current[0], 'retained variant document').to.equal(iframe))
    })

    cy.get(widthHandle).invoke('attr', 'aria-valuenow').as('savedWidth')
    cy.get(heightHandle).invoke('attr', 'aria-valuenow').as('savedHeight')
    cy.reload()
    cy.get(widthHandle).should('be.visible')
    cy.get('@savedWidth').then(width => cy.get(widthHandle).should('have.attr', 'aria-valuenow', width))
    cy.get('@savedHeight').then(height => cy.get(heightHandle).should('have.attr', 'aria-valuenow', height))

    cy.get('button[aria-label="Viewport"]').click()
    cy.contains('[role="dialog"] button', /^Responsive/).click()
    cy.get('@savedWidth').then(savedWidth => cy.get(widthHandle).should(($handle) => {
      expect($handle.attr('aria-valuenow'), 'Responsive width').not.to.equal(savedWidth)
    }))
  })
})
