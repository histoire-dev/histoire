/// <reference types="cypress" />

import { setSingleViewportSize, visitSingle } from '../../../cypress/single-variant.js'

const surface = '.histoire-single-variant'
const canvas = '[aria-label="Story canvas"]'

/** Select zoom through existing menu, including Fit. */
function zoom(label) {
  cy.get('button[aria-label="Zoom level"]').click()
  cy.contains('[role="dialog"] button', label).click()
}

/** Drag in parent client pixels; large moves deliberately overshoot frame edges. */
function drag(deltaX, deltaY, button = 0) {
  cy.get(surface).then(($surface) => {
    const rect = $surface[0].getBoundingClientRect()
    const start = { eventConstructor: 'PointerEvent', pointerId: 41, button, clientX: rect.left + 100, clientY: rect.top + 100, force: true }
    cy.get(canvas).trigger('pointerdown', start)
    cy.get(canvas).trigger('pointermove', { ...start, clientX: start.clientX + deltaX, clientY: start.clientY + deltaY })
    cy.get(canvas).trigger('pointerup', start)
  })
}

/** Compare native scroll and actual frame edges, ignoring protruding resize grips. */
function assertEdge(horizontal, vertical) {
  cy.get(surface).should(($surface) => {
    const element = $surface[0]
    const frame = element.querySelector('[data-frame-id]').getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const maxX = Math.max(0, frame.width - element.clientWidth)
    const maxY = Math.max(0, frame.height - element.clientHeight)
    expect(element.scrollLeft).to.be.closeTo(horizontal ? maxX : 0, 1)
    expect(element.scrollTop).to.be.closeTo(vertical ? maxY : 0, 1)
    if (horizontal && maxX > 0) expect(frame.right).to.be.closeTo(rect.left + element.clientWidth, 1)
    if (vertical && maxY > 0) expect(frame.bottom).to.be.closeTo(rect.top + element.clientHeight, 1)
  })
}

describe('bounded single variant camera', () => {
  beforeEach(() => {
    visitSingle('/story/src-components-eventbutton-story-vue?variantId=_default&arrange=single')
    cy.getPreviewIframeBody().contains('button', 'Send')
  })

  it('pans zoomed frame to both edges and releases input after Fit', () => {
    zoom(/^200%$/)
    // Single view has no free camera: Pan tool is disabled, middle mouse still scrolls bounded content.
    cy.get('button[aria-label="Pan"]').should('be.disabled')
    cy.get(surface).invoke('height').then((height) => {
      drag(-10000, -10000, 1)
      assertEdge(true, true)
      cy.get(surface).invoke('height').should('equal', height)
    })
    drag(10000, 10000, 1)
    assertEdge(false, false)
    zoom(/^\s*Fit to canvas/)
    drag(-200, -200, 1)
    assertEdge(false, false)
    // Fitting frame must still accept native input after panning.
    cy.getPreviewIframeBody().find('input').first().clear().type('Pan released').should('have.value', 'Pan released')
    cy.getPreviewIframeBody().contains('button', 'Send').click()
    cy.get('button[aria-label="Show inspector"]').click()
    cy.get('[aria-label="1 unseen events"]').should('be.visible')
  })

  it('locks fitting axes for Space and middle mouse without resizing available area', () => {
    setSingleViewportSize(1600, 300)
    zoom(/^100%/)
    cy.get(surface).invoke('height').then((height) => {
      cy.get(canvas).focus().trigger('keydown', { key: ' ', code: 'Space', force: true })
      drag(-10000, -10000)
      assertEdge(true, false)
      cy.get(surface).invoke('height').should('equal', height)
    })
    cy.get(canvas).trigger('keyup', { key: ' ', code: 'Space', force: true })
    setSingleViewportSize(300, 1600)
    drag(-10000, -10000, 1)
    assertEdge(false, true)
    drag(10000, 10000, 1)
    assertEdge(false, false)
  })
})
