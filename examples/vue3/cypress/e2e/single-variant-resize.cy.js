/// <reference types="cypress" />

import { setSingleViewportSize, visitSingle } from '../../../cypress/single-variant.js'

const widthHandle = '[aria-label="Resize viewport width"]'
const heightHandle = '[aria-label="Resize viewport height"]'
const cornerHandle = '[data-test-id="single-resize-both"]'

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
  it('resizes with pointer and keyboard, retains document, and persists canonical dimensions', () => {
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

    cy.get(widthHandle).invoke('attr', 'aria-valuenow').as('savedWidth', { type: 'static' })
    cy.get(heightHandle).invoke('attr', 'aria-valuenow').as('savedHeight', { type: 'static' })
    cy.reload()
    cy.get(widthHandle).should('be.visible')
    // Single-mode sizing intent is workbench memory; canonical dimensions persist separately.
    cy.get('@savedWidth').then(width => cy.window().should((window) => {
      expect(JSON.parse(window.localStorage.getItem('_histoire-sandbox-settings-v3')).responsiveWidth).to.equal(Number(width))
    }))
    cy.get('@savedHeight').then(height => cy.window().should((window) => {
      expect(JSON.parse(window.localStorage.getItem('_histoire-sandbox-settings-v3')).responsiveHeight).to.equal(Number(height))
    }))

    setSingleViewportSize(2000, 1200)
    cy.get('button[aria-label="Viewport"]').click()
    cy.contains('[role="dialog"] button', /^Responsive/).click()
    cy.get(widthHandle).should(($handle) => {
      const surface = $handle[0].closest('.histoire-single-variant')
      expect(Number($handle.attr('aria-valuenow')), 'Responsive width').to.equal(surface.clientWidth)
    })
  })
})
