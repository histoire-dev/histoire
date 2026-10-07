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
function storedCanvasZoom(window, arrangement = 'grid') {
  return JSON.parse(window.localStorage.getItem('_histoire-ui-canvas')).zoomByArrange[arrangement]
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

/** Selection must fill one usable dimension, not merely remain somewhere inside the canvas. */
function assertSelectionFit() {
  const selected = '[data-frame-id]:has(> button[aria-pressed="true"])'
  assertFrames(selected)
  cy.get(canvas).should(($canvas) => {
    const root = $canvas[0]
    const viewport = root.getBoundingClientRect()
    const header = root.querySelector('.histoire-canvas-header').getBoundingClientRect()
    const inspector = root.ownerDocument.querySelector('aside.histoire-inspector-frame')?.getBoundingClientRect()
    const rect = root.querySelector(selected).getBoundingClientRect()
    const widthRemaining = (inspector ? inspector.left - 12 : viewport.right) - viewport.left - 64 - rect.width
    const heightRemaining = viewport.bottom - header.bottom - 64 - rect.height
    expect(Math.min(Math.abs(widthRemaining), Math.abs(heightRemaining)), 'selection fills limiting content dimension').to.be.lessThan(2)
  })
}

describe('canvas overlay geometry', () => {
  for (const initialArrangement of ['grid', 'list']) {
    it(`fits story-only List navigation from initial ${initialArrangement}`, () => {
      visitCanvas(`/story/src-components-workbenchmatrix-story-vue?variantId&arrange=${initialArrangement}`)
      if (initialArrangement === 'grid') {
        cy.location('search').should('not.include', 'variantId=default')
        cy.get('button[aria-label="List"]').click()
      }
      cy.location('search').should('include', 'variantId=default')
      cy.get('button[aria-label="Zoom level"]').should('contain', 'Selection')
      assertSelectionFit()
      cy.get('[aria-label="Story tree"] .vue-recycle-scroller').scrollTo('bottom')
      cy.contains('[data-test-id="story-list-variant"]', /^Alternate$/).click()
      cy.location('search').should('include', 'variantId=alternate')
      assertSelectionFit()
    })
  }

  it('hides editor actions for generated Tailwind story and keeps List navigation', () => {
    visitCanvas('/story/tailwind?variantId=background-color')
    cy.get(`${canvas} .histoire-canvas-file`).should('not.exist')
    cy.get('[aria-label="Expand source"]').click()
    cy.get('[aria-label="Open source in editor"]').should('not.exist')
    cy.get(`${canvas} [data-frame-id]`).first().rightclick('center', { force: true })
    cy.contains('[role="menuitem"] span', /^Open in editor$/).should('not.exist')
    cy.get('body').type('{esc}')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'k', code: 'KeyK', ctrlKey: true })
    cy.get('[aria-label="Search stories, docs and props"]').should('be.focused').type('Open file')
    cy.contains('[data-test-id="search-modal"] button', /^Open file in editor$/).should('not.exist')
    cy.get('[aria-label="Search stories, docs and props"]').type('{esc}')
    cy.get('button[aria-label="List"]').click()
    cy.location('search').should('include', 'variantId=background-color')
    cy.get('button[aria-label="Zoom level"]').should('contain', 'Selection')
    assertSelectionFit()
  })

  it('preserves saved 67% zoom and places initial Code gen frame below header', () => {
    visitCanvas(codegen, 0.67)
    cy.get(`${canvas} .histoire-canvas-file`).should('exist')
    cy.request({ url: '/__histoire/local/descriptor.json', failOnStatusCode: false }).then((response) => {
      if (response.status !== 200 || response.body.mode !== 'dev') return
      cy.get(`${canvas} [data-frame-id]`).first().rightclick('center', { force: true })
      cy.contains('[role="menuitem"] span', /^Open in editor$/).should('exist')
      cy.get('body').type('{esc}')
    })
    cy.get('button[aria-label="Zoom level"]').should('contain', '67%')
    assertFrames('.histoire-canvas-frame.is-selected', false)
    cy.screenshot('canvas-overlay-saved-zoom')
    zoomAction('Zoom to selection')
    assertFrames('.histoire-canvas-frame.is-selected')
  })

  it('fits selected Story variant after double-clicking its tree row', () => {
    const target = JSON.stringify(['src-components-codegen-story-vue', 'props'])
    visitCanvas(codegen, 0.67)
    cy.contains('[data-test-id="story-list-variant"]', /^props$/).dblclick()
    cy.location('search').should('include', 'variantId=props')
    cy.window().should((window) => {
      expect(storedCanvasZoom(window), 'double-click stores fitted numeric zoom').to.be.a('number')
    })
    cy.get(canvas).should(($canvas) => {
      const root = $canvas[0]
      const header = root.querySelector('.histoire-canvas-header').getBoundingClientRect()
      const footer = root.querySelector('.histoire-canvas-info')?.getBoundingClientRect()
      const viewport = root.getBoundingClientRect()
      const inspector = root.ownerDocument.querySelector('aside.histoire-inspector-frame')?.getBoundingClientRect()
      const frame = [...root.querySelectorAll('[data-frame-id]')].find(element => element.getAttribute('data-frame-id') === target)
      expect(frame, 'target frame').to.not.equal(undefined)
      const rect = frame.getBoundingClientRect()
      expect(rect.left, 'target frame starts inside canvas').to.be.at.least(viewport.left - 1)
      expect(rect.top, 'target frame starts below header').to.be.at.least(header.bottom - 1)
      expect(rect.right, 'target frame clears inspector').to.be.at.most((inspector ? inspector.left - 12 : viewport.right) + 1)
      expect(rect.bottom, 'target frame clears footer').to.be.at.most((footer?.top ?? viewport.bottom) + 1)
    })
  })

  it('scrolls a revealed canvas variant into the Stories tree', () => {
    const storyId = 'src-components-workbenchmatrix-story-vue'
    const variantId = 'alternate'
    const rowKey = JSON.stringify(['variant', storyId, variantId])
    const frameKey = JSON.stringify([storyId, variantId])
    visitCanvas(`/story/${storyId}?variantId=default&arrange=grid`)
    cy.viewport(1200, 700)
    cy.get('.stories-tree .vue-recycle-scroller').should(($scroller) => {
      const viewport = $scroller[0].getBoundingClientRect()
      const row = [...$scroller[0].querySelectorAll('[data-tree-key]')].find(element => element.getAttribute('data-tree-key') === rowKey)
      const bounds = row?.getBoundingClientRect()
      const visible = Boolean(bounds && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom)
      expect(visible, 'target variant starts outside the Stories viewport').to.equal(false)
    })
    cy.get(canvas).find('[data-frame-id]').filter((_, element) => element.getAttribute('data-frame-id') === frameKey).rightclick('center', { force: true })
    cy.contains('[role="menuitem"]', /^Reveal in tree$/).click()
    cy.get('.stories-tree .vue-recycle-scroller').should(($scroller) => {
      const viewport = $scroller[0].getBoundingClientRect()
      const row = [...$scroller[0].querySelectorAll('[data-tree-key]')].find(element => element.getAttribute('data-tree-key') === rowKey)
      expect(row, 'exact variant row').to.not.equal(null)
      if (!row) return
      const bounds = row.getBoundingClientRect()
      expect(bounds.top, 'row top within Stories viewport').to.be.at.least(viewport.top)
      expect(bounds.bottom, 'row bottom within Stories viewport').to.be.at.most(viewport.bottom)
    })
    cy.location('search').should('include', `variantId=${variantId}`)
  })

  it('defaults List to selection fit and follows later selection', () => {
    visitCanvas(matrix.replace('&arrange=matrix', ''))
    cy.get('button[aria-label="List"]').click()
    cy.get('button[aria-label="Zoom level"]').should('contain', 'Selection')
    assertFrames('.histoire-canvas-frame.is-selected')
    cy.window().should((window) => {
      expect(storedCanvasZoom(window, 'list'), 'List stores selection-fit mode').to.equal('selection')
    })
    // Selection fit virtualizes the next canvas row; select through story navigation.
    cy.get('[aria-label="Story tree"] .vue-recycle-scroller').scrollTo('bottom')
    cy.contains('[data-test-id="story-list-variant"]', /^Alternate$/).click()
    cy.location('search').should('include', 'variantId=alternate')
    cy.window().should((window) => {
      expect(storedCanvasZoom(window, 'list'), 'later List selection retains mode').to.equal('selection')
    })
    assertFrames('.histoire-canvas-frame.is-selected')
    cy.viewport(1000, 760)
    assertFrames('.histoire-canvas-frame.is-selected')
  })

  it('remembers explicit numeric and canvas Fit choices for List', () => {
    visitCanvas(`${matrix.replace('&arrange=matrix', '')}&arrange=list`)
    assertFrames('.histoire-canvas-frame.is-selected')
    zoomAction('50%')
    cy.get('button[aria-label="Grid"]').click()
    cy.get('button[aria-label="List"]').click()
    cy.window().should((window) => {
      expect(storedCanvasZoom(window, 'list')).to.equal(0.5)
    })
    zoomAction('Fit to canvas')
    cy.contains('.histoire-frame-label', /^Alternate$/).click({ force: true })
    cy.location('search').should('include', 'variantId=alternate')
    cy.get('button[aria-label="Grid"]').click()
    cy.get('button[aria-label="List"]').click()
    cy.window().should((window) => {
      expect(storedCanvasZoom(window, 'list')).to.equal('fit')
    })
    cy.reload()
    cy.get('button[aria-label="Zoom level"]').should('contain', 'Fit')
    zoomAction('Zoom to selection')
    cy.get('button[aria-label="Zoom level"]').should('contain', 'Selection')
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
    // Axes arrive after runtime readiness; iframe existence alone does not imply ready cells.
    cy.get('.histoire-matrix-cell', { timeout: 20000 }).should('have.length', 4)
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
