/// <reference types="cypress" />

/** Explicit axes keep saved local Matrix choices from changing this fixture. */
const matrix = '/story/src-components-workbenchmatrix-story-vue?variantId=default&arrange=matrix&rows=enabled&cols=emphasized'
/** Native cell chrome owns selection and frame menu keyboard entry. */
const cell = '[aria-label="Select matrix cell false · false"]'
/** Canvas and measurement surface share one pointer-pan owner. */
const canvas = '[aria-label="Story canvas"]'
/** Accessible lock name remains stable while a pan gesture is active. */
const measurement = '[aria-label="Lock measurement"]'
/** Fixed story proves header, status and pan-hint geometry with live previews. */
const story = '/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0'
const shellStorageKey = '_histoire-ui-shell'

/** Start each layout assertion from a known wide, visible pane and inspector. */
function visitDesktop(path) {
  cy.viewport(1600, 1000)
  cy.visit(path, {
    onBeforeLoad(window) {
      window.localStorage.setItem(shellStorageKey, JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
    },
  })
}

/** Keyboard separator input exercises the same persisted width update as pointer resize. */
function resizePanel(label) {
  cy.get(`[aria-label="${label}"]`).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'End', code: 'End' })
}

/** Assert bounds rather than implementation styles for dynamic canvas information. */
function assertCanvasInfo({ inspector = true, matrix = false, pan = false } = {}) {
  cy.window().then((window) => {
    const canvasElement = window.document.querySelector(canvas)
    const info = window.document.querySelector('.histoire-canvas-info')
    const header = window.document.querySelector('.histoire-canvas-header')
    const inspectorElement = window.document.querySelector('aside.histoire-inspector-frame')
    expect(canvasElement, 'canvas').to.not.equal(null)
    expect(info, 'canvas info region').to.not.equal(null)
    expect(header, 'canvas header').to.not.equal(null)
    if (inspector) expect(inspectorElement, 'inspector').to.not.equal(null)
    const canvasBounds = canvasElement.getBoundingClientRect()
    const inspectorBounds = inspectorElement?.getBoundingClientRect()
    const usableEnd = inspectorBounds ? inspectorBounds.left - 12 : canvasBounds.right
    const expectedStart = canvasBounds.left + 36
    const expectedEnd = usableEnd - 36
    const infoBounds = info.getBoundingClientRect()
    const headerBounds = header.getBoundingClientRect()
    expect(infoBounds.left, 'info start').to.be.closeTo(expectedStart, 1)
    expect(infoBounds.right, 'info end').to.be.closeTo(expectedEnd, 1)
    expect(headerBounds.left, 'header start').to.be.closeTo(expectedStart, 1)
    expect(headerBounds.right, 'header end').to.be.closeTo(expectedEnd, 1)
    if (pan) {
      const hint = window.document.querySelector('.histoire-pan-hint')
      expect(hint, 'pan hint').to.not.equal(null)
      const hintBounds = hint.getBoundingClientRect()
      expect(hintBounds.left + hintBounds.width / 2, 'pan hint center').to.be.closeTo((canvasBounds.left + usableEnd) / 2, 1)
    }
    if (matrix) {
      const axes = window.document.querySelector('.histoire-matrix-axis-position')
      expect(axes, 'matrix axes').to.not.equal(null)
      const axesBounds = axes.getBoundingClientRect()
      expect(axesBounds.left, 'matrix axes start').to.be.closeTo(expectedStart, 1)
      expect(axesBounds.right, 'matrix axes end').to.be.closeTo(expectedEnd, 1)
    }
  })
}

/** Wait for actual passive iframe rendering before activating its chrome. */
function readyMatrix() {
  cy.viewport(1600, 1000)
  cy.visit(matrix)
  cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
  cy.get('[aria-label="Story canvas"] iframe').should(($frames) => {
    const ready = [...$frames].filter(frame => frame.contentDocument?.body.textContent.includes('Matrix message'))
    expect(ready.length, 'rendered Matrix previews').to.be.at.least(4)
  })
}

/** Exercise native event routing and prove client-pixel motion, rather than toolbar state. */
function panFromMeasurement(button) {
  cy.get(cell).then(($cell) => {
    const before = $cell[0].getBoundingClientRect()
    const start = { clientX: before.x + before.width / 2, clientY: before.y + before.height / 2 }
    const end = { clientX: start.clientX + 48, clientY: start.clientY + 32 }
    cy.get(measurement)
      .trigger('pointerdown', { eventConstructor: 'PointerEvent', pointerId: 17, button, buttons: button === 1 ? 4 : 1, ...start, force: true })
      .trigger('pointermove', { eventConstructor: 'PointerEvent', pointerId: 17, buttons: button === 1 ? 4 : 1, ...end, force: true })
      .trigger('pointerup', { eventConstructor: 'PointerEvent', pointerId: 17, button, buttons: 0, ...end, force: true })
    // Browsers synthesize a primary click after drag; it must not lock Measure.
    if (button === 0) cy.get(measurement).trigger('click', { eventConstructor: 'MouseEvent', button: 0, ...end, force: true })
    cy.get(cell).should(($moved) => {
      const after = $moved[0].getBoundingClientRect()
      expect(after.x - before.x, 'horizontal pan from measurement surface').to.be.closeTo(48, 1)
      expect(after.y - before.y, 'vertical pan from measurement surface').to.be.closeTo(32, 1)
    })
    cy.get(measurement).should('have.attr', 'aria-pressed', 'false')
  })
}

describe('UI review round 2 regressions', () => {
  it('reflows canvas information with pane resize and inspector visibility', () => {
    visitDesktop(story)
    cy.getPreviewIframeBody().contains('Hello world!')
    resizePanel('Resize side panel')
    resizePanel('Resize inspector')
    assertCanvasInfo()
    cy.get(canvas).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space', force: true })
    cy.contains('[aria-live="polite"]', 'Panning').should('be.visible')
    assertCanvasInfo({ pan: true })
    cy.get(canvas).trigger('keyup', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space', force: true })
    cy.get('[aria-label="Close inspector"]').click()
    cy.get('aside.histoire-inspector-frame').should('not.exist')
    assertCanvasInfo({ inspector: false })
  })

  it('reflows Matrix axes with pane resize and inspector visibility', () => {
    visitDesktop(matrix)
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
    resizePanel('Resize side panel')
    resizePanel('Resize inspector')
    assertCanvasInfo({ matrix: true })
    cy.get('[aria-label="Close inspector"]').click()
    cy.get('aside.histoire-inspector-frame').should('not.exist')
    assertCanvasInfo({ inspector: false, matrix: true })
  })

  it('copies Markdown link with local anchor while preserving host route', () => {
    cy.visit('/story/src-components-markdownlinks-story-vue?variantId')
    cy.contains('[aria-label="Histoire documentation"] h1', 'Welcome').should('be.visible')
    cy.location('href').then((url) => {
      cy.window().then((window) => {
        cy.stub(window.navigator.clipboard, 'writeText').resolves().as('anchorClipboard')
      })
      cy.get('#link-to-welcome').click()
      cy.get('button[aria-label="Copy link"]').click()
      cy.get('@anchorClipboard').should('have.been.calledWithExactly', `${url}#welcome`)
      cy.location('href').should('equal', url)
    })
  })

  it('opens Matrix frame menu by pointer and both keyboard paths without changing selection', () => {
    readyMatrix()
    cy.location('href').as('matrixUrl')
    cy.get(cell).click().should('have.attr', 'aria-pressed', 'true')
    cy.get(cell).rightclick()
    cy.contains('[role="menuitem"]', /^Copy source/).should('be.visible').closest('[role="menu"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
    for (const key of [{ key: 'F10', code: 'F10', shiftKey: true }, { key: 'ContextMenu', code: 'ContextMenu' }]) {
      cy.get(cell).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', ...key })
      cy.contains('[role="menuitem"]', /^Copy source/).should('be.visible').closest('[role="menu"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
      cy.get(cell).should('be.focused').and('have.attr', 'aria-pressed', 'true')
    }
    cy.get('@matrixUrl').then(url => cy.location('href').should('equal', url))
  })

  for (const gesture of ['middle', 'space']) {
    it(`temporarily pans selected Matrix preview with Measure using ${gesture}`, () => {
      readyMatrix()
      cy.get(cell).click()
      cy.get('[aria-label="Measure"]').click().should('have.attr', 'aria-pressed', 'true')
      if (gesture === 'space') {
        // Keyboard input targets focus, not a child covering canvas center.
        cy.get(canvas).focus().should('be.focused').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space', force: true })
        cy.contains('[aria-live="polite"]', 'Panning').should('be.visible')
      }
      panFromMeasurement(gesture === 'middle' ? 1 : 0)
      if (gesture === 'space') cy.get(canvas).trigger('keyup', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space' })
      cy.get('[aria-label="Measure"]').should('have.attr', 'aria-pressed', 'true')
      cy.get(measurement).click()
      cy.get('[aria-label="Unlock measurement"]').should('have.attr', 'aria-pressed', 'true').click()
      cy.get(measurement).should('have.attr', 'aria-pressed', 'false')
      cy.get('[aria-label="Pan"]').click().should('have.attr', 'aria-pressed', 'true')
      cy.get(measurement).should('not.exist')
      cy.get('[aria-label="Measure"]').should('have.attr', 'aria-pressed', 'false')
    })
  }
})
