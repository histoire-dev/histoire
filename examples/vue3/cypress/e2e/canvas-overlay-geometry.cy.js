/// <reference types="cypress" />

const canvas = '[aria-label="Story canvas"]'
const codegen = '/story/src-components-codegen-story-vue?variantId=html'
const matrix = '/story/src-components-workbenchmatrix-story-vue?variantId=default&arrange=matrix&rows=enabled&cols=emphasized'

/** Known saved geometry reproduces the attached canvas screenshot independently of prior tests. */
function visitCanvas(path = codegen, zoom = 'fit') {
  cy.viewport(1600, 1000)
  cy.visit(path, {
    onBeforeLoad(window) {
      window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
      window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom, tool: 'select', frameBackground: 'transparent' }))
      window.localStorage.setItem('_histoire-sandbox-settings-v3', JSON.stringify({ responsiveWidth: 431, responsiveHeight: 640, rotate: false }))
    },
  })
  cy.get(`${canvas} .histoire-canvas-header`).should('be.visible')
  cy.get(`${canvas} .histoire-canvas-header .histoire-canvas-status`).should('be.visible')
  cy.get(`${canvas} iframe`).should('exist')
}

/** Public menu action exercises the same transform as its keyboard shortcut. */
function zoomAction(label) {
  cy.get('button[aria-label="Zoom level"]').click()
  cy.contains('[role="dialog"][aria-label="Zoom level"] button', label).click()
}

/** Read persisted numeric or automatic canvas zoom without coupling assertions to menu labels. */
function storedCanvasZoom(window) {
  return JSON.parse(window.localStorage.getItem('_histoire-ui-canvas')).zoom
}

/** Header metadata stays inside inspector-safe canvas space across responsive reflows. */
function assertHeaderStatus() {
  cy.get(canvas).should(($canvas) => {
    const root = $canvas[0]
    const viewport = root.getBoundingClientRect()
    const inspector = root.ownerDocument.querySelector('aside.histoire-inspector-frame')?.getBoundingClientRect()
    const right = inspector ? inspector.left - 12 : viewport.right
    const header = root.querySelector('.histoire-canvas-header')
    const status = header?.querySelector('.histoire-canvas-status')
    const file = header?.querySelector('.histoire-canvas-file')
    expect(status, 'viewport status').to.not.equal(null)
    const statusBounds = status.getBoundingClientRect()
    expect(statusBounds.right, 'status inline end').to.be.closeTo(right - 36, 1)
    if (file) {
      const fileBounds = file.getBoundingClientRect()
      expect(statusBounds.top, 'status below source path').to.be.at.least(fileBounds.bottom - 1)
    }
  })
}

/** Check visible labels and previews against real overlay boundaries, never CSS class values. */
function assertFrames(selector = '.histoire-canvas-frame', allEdges = true) {
  assertHeaderStatus()
  cy.get(canvas).should(($canvas) => {
    const root = $canvas[0]
    const header = root.querySelector('.histoire-canvas-header').getBoundingClientRect()
    const footer = root.querySelector('.histoire-canvas-info')?.getBoundingClientRect()
    const viewport = root.getBoundingClientRect()
    const inspector = root.ownerDocument.querySelector('aside.histoire-inspector-frame')?.getBoundingClientRect()
    const right = inspector ? inspector.left - 12 : viewport.right
    const top = selector === '.histoire-matrix-cell' ? root.querySelector('.histoire-matrix-board').getBoundingClientRect().top : header.bottom
    const frames = [...root.querySelectorAll(selector)]
    expect(frames.length, 'rendered frames').to.be.greaterThan(0)
    for (const frame of frames) {
      const rect = frame.getBoundingClientRect()
      expect(rect.top, 'frame label below fixed chrome').to.be.at.least(top - 1)
      if (allEdges) {
        expect(rect.left, 'frame starts inside canvas').to.be.at.least(viewport.left - 1)
        expect(rect.right, 'frame clear of inspector').to.be.at.most(right + 1)
        expect(rect.bottom, footer ? 'frame ends above Pan hint' : 'frame ends inside canvas').to.be.at.most((footer?.top ?? viewport.bottom) + 1)
      }
    }
  })
}

describe('canvas overlay geometry', () => {
  it('preserves saved 67% zoom and places initial Code gen frame below header', () => {
    visitCanvas(codegen, 0.67)
    cy.get('button[aria-label="Zoom level"]').should('contain', '67%')
    assertFrames('.histoire-canvas-frame.is-selected', false)
    cy.screenshot('canvas-overlay-saved-zoom')
    zoomAction('Zoom to selection')
    assertFrames('.histoire-canvas-frame.is-selected')
  })

  it('fits selected variant once when List opens and preserves zoom for later selection', () => {
    let initialZoom
    visitCanvas(`${matrix.replace('&arrange=matrix', '')}&arrange=list`)
    assertFrames('.histoire-canvas-frame.is-selected')
    cy.window().then((window) => {
      initialZoom = storedCanvasZoom(window)
      expect(initialZoom, 'List entry stores selected-frame fit').to.be.a('number')
    })
    cy.contains('.histoire-frame-label', /^Alternate$/).click({ force: true })
    cy.location('search').should('include', 'variantId=alternate')
    cy.window().should((window) => {
      expect(storedCanvasZoom(window), 'later List selection preserves fitted zoom').to.equal(initialZoom)
    })
    assertFrames('.histoire-canvas-frame.is-selected')
  })

  for (const arrange of ['grid', 'list']) {
    it(`keeps ${arrange} labels clear of overlays and supports explicit canvas fit`, () => {
      // Eleven Code gen rows exceed minimum 10% zoom in List; two-row fixture can fit.
      const path = arrange === 'grid' ? codegen : matrix.replace('&arrange=matrix', '')
      const initialFrames = arrange === 'list' ? '.histoire-canvas-frame.is-selected' : undefined
      visitCanvas(`${path}&arrange=${arrange}`)
      assertFrames(initialFrames)
      cy.get('[aria-label="Close inspector"]').click()
      assertFrames(initialFrames)
      cy.viewport(1000, 760)
      assertFrames(initialFrames, arrange === 'grid')
      zoomAction('Fit to canvas')
      assertFrames()
      zoomAction('Zoom to selection')
      assertFrames('.histoire-canvas-frame.is-selected')
      cy.screenshot(`canvas-overlay-${arrange}-desktop`)
    })
  }

  it('fits Matrix between its fixed controls and footer', () => {
    visitCanvas(matrix)
    cy.get('.histoire-matrix-cell').should('have.length', 4)
    assertFrames('.histoire-matrix-cell')
    cy.get('[aria-label="Close inspector"]').click()
    cy.viewport(1000, 760)
    zoomAction('Fit to canvas')
    assertFrames('.histoire-matrix-cell')
  })

  it('keeps Fit transform stable when Space or middle mouse changes temporary hint', () => {
    visitCanvas()
    cy.get('.histoire-canvas-frame.is-selected').then(($frame) => {
      const before = $frame[0].getBoundingClientRect()
      cy.get(canvas).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space', force: true })
      cy.get('.histoire-pan-hint').should('be.visible')
      cy.get('.histoire-canvas-frame.is-selected').should(($current) => {
        const after = $current[0].getBoundingClientRect()
        expect(after.x).to.be.closeTo(before.x, 0.1)
        expect(after.y).to.be.closeTo(before.y, 0.1)
        expect(after.width).to.be.closeTo(before.width, 0.1)
      })
      cy.get(canvas).trigger('keyup', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space', force: true })
      cy.get(canvas).trigger('pointerdown', { eventConstructor: 'PointerEvent', pointerId: 43, button: 1, clientX: before.x, clientY: before.y, force: true })
      cy.get('.histoire-pan-hint').should('be.visible')
      cy.get('.histoire-canvas-frame.is-selected').should(($current) => {
        const after = $current[0].getBoundingClientRect()
        expect(after.y).to.be.closeTo(before.y, 0.1)
        expect(after.width).to.be.closeTo(before.width, 0.1)
      })
      cy.get(canvas).trigger('pointerup', { eventConstructor: 'PointerEvent', pointerId: 43, button: 1, force: true })
    })
  })

  it('fits a narrow canvas with responsive toolbar and hidden inspector', () => {
    visitCanvas()
    cy.get('[aria-label="Close inspector"]').click()
    cy.get('[aria-label="Collapse side panel"]').click()
    cy.viewport(600, 900)
    assertFrames()
    cy.screenshot('canvas-overlay-narrow')
  })
})
