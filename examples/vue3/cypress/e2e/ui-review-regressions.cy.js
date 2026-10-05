/// <reference types="cypress" />

import { captureMatrixCell, observeScreenshotReplies } from '../../../cypress/ui-review-capture.js'
import { getGeneratedSource } from '../../../cypress/workbench-actions.js'
import { primaryPreviewFrame } from '../../../cypress/workbench-contract.js'

/** Existing canonical Vue fixture shared by source and narrow navigation regressions. */
const demo = '/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0'
/** Search input and rail retain public accessible names across pane lifetimes. */
const searchInput = '[aria-label="Search stories, docs and props"]'
/** Exact current-source docs rendering, excluding unrelated hidden metadata. */
const docs = '[aria-label="Histoire documentation"]'

/** Real row geometry verifies recycler spacing, including heading and content pools. */
function assertTreeGaps() {
  cy.get('[aria-label="Story tree"] [data-virtual-key] > :is(button, h3)').should(($rows) => {
    const rects = [...$rows].map(row => row.getBoundingClientRect()).filter(rect => rect.height > 0).sort((left, right) => left.top - right.top)
    expect(rects.length, 'mounted recycler content').to.be.greaterThan(2)
    for (let index = 1; index < rects.length; index++) {
      expect(rects[index].top - rects[index - 1].bottom, `gap before row ${index}`).to.be.closeTo(1, 0.25)
    }
  })
}

describe('UI review regressions', () => {
  beforeEach(() => {
    cy.viewport(1600, 1000)
  })

  it('keeps narrow Docs Search activation and explicit deep-link anchor through Ctrl+K dismissal', () => {
    cy.viewport(390, 844)
    cy.visit(demo)
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[data-test-id="search-btn"]').click()
    cy.contains('[aria-label="Search scope"] button', /^Docs$/).click()
    cy.get(searchInput).type('Deserunt')
    cy.contains('[data-test-id="search-item"][data-search-kind="docs"]', 'Docs').click()
    cy.location('pathname').should('equal', '/story/src-components-docs-story-vue')
    cy.location('search').should('include', 'variantId').and('include', 'tab=docs')
    cy.contains('[aria-label="Inspector"] [role="tab"]', /^\s*Docs\s*$/).should('have.attr', 'aria-selected', 'true')
    cy.contains(`${docs} h1`, /^Title/).should('be.visible')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.get('[data-test-id="search-btn"]').should('be.focused').trigger('keydown', {
      eventConstructor: 'KeyboardEvent',
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    cy.get(searchInput).should('be.focused').type('Link to welcome')
    cy.contains('[aria-label="Search scope"] button', /^Docs$/).click()
    cy.contains('[data-test-id="search-item"][data-search-kind="docs"]', 'MarkdownLinks').click()
    cy.location('pathname').should('equal', '/story/src-components-markdownlinks-story-vue')
    cy.location('search').should('include', 'tab=docs')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.get('[data-test-id="search-btn"]').should('be.focused')
    // Host deep link supplies URL anchor; native docs links keep navigation local.
    cy.visit('/story/src-components-markdownlinks-story-vue?variantId&tab=docs#welcome')
    cy.get(`${docs} h1#welcome`).should('be.visible').and('contain', 'Welcome')
    cy.location('hash').should('equal', '#welcome')
    cy.get('#link-to-welcome').should('be.visible').click()
    cy.location('hash').should('equal', '#welcome')
    cy.get('[data-test-id="search-btn"]').trigger('keydown', {
      eventConstructor: 'KeyboardEvent',
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    cy.get(searchInput).should('be.focused').type('{esc}')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.location('hash').should('equal', '#welcome')
    cy.location('search').should('include', 'tab=docs')
  })

  it('dims nonmatching frames and pans matches without changing canonical selection or document', () => {
    cy.visit('/story/src-components-codegen-story-vue?variantId=html')
    cy.getPreviewIframeBody().contains('h1', 'Title')
    cy.get('[aria-label="Zoom level"][aria-haspopup="dialog"]').click()
    cy.contains('[role="dialog"][aria-label="Zoom level"] button', /^100%/).click()
    cy.get('[aria-label="Zoom level"]').should('contain', '100%')
    cy.location('href').as('canonicalUrl')
    cy.get(primaryPreviewFrame).its('0.contentDocument').as('canonicalDocument')
    cy.get('[data-test-id="search-btn"]').click()
    cy.get(searchInput).type('slot')
    cy.contains('[aria-label="Search scope"] button', /^Stories$/).click()
    cy.get('[aria-label="Search matches"]').should('be.visible').and('not.be.empty')
    cy.get('[data-frame-id]').should(($frames) => {
      const opacities = [...$frames].map(frame => Number(frame.ownerDocument.defaultView.getComputedStyle(frame).opacity))
      expect(opacities.filter(value => value === 1)).to.have.length.at.least(2)
      expect(opacities.filter(value => value < 1)).to.have.length.at.least(1)
    })
    cy.get(primaryPreviewFrame).should(($frame) => {
      const layer = $frame[0].closest('.histoire-canvas-primary')
      expect(Number(layer.ownerDocument.defaultView.getComputedStyle(layer).opacity), 'nonmatching canonical document is dimmed').to.be.lessThan(1)
    })
    // Already visible matches correctly need no movement; pan all targets out first.
    cy.get('[aria-label="Story canvas"]').trigger('wheel', { eventConstructor: 'WheelEvent', deltaY: 10000, bubbles: true, cancelable: true })
    cy.get('[data-frame-id]').first().then(($frame) => {
      const before = $frame[0].getBoundingClientRect()
      cy.get('[aria-label="Next search match"]').should('not.be.disabled').click()
      cy.wrap($frame).should(($moved) => {
        const after = $moved[0].getBoundingClientRect()
        expect(Math.hypot(after.x - before.x, after.y - before.y), 'match reveal pans canvas').to.be.greaterThan(1)
      })
    })
    cy.get('[aria-label="Search matches"]').invoke('text').should('match', /^1 \/ \d+$/)
    cy.get('[aria-label="Story canvas"]').trigger('wheel', { eventConstructor: 'WheelEvent', deltaY: 10000, bubbles: true, cancelable: true })
    cy.get('[data-frame-id]').first().then(($frame) => {
      const before = $frame[0].getBoundingClientRect()
      cy.get('[aria-label="Previous search match"]').should('not.be.disabled').click()
      cy.wrap($frame).should(($moved) => {
        const after = $moved[0].getBoundingClientRect()
        expect(Math.hypot(after.x - before.x, after.y - before.y), 'previous matching frame pans canvas').to.be.greaterThan(1)
      })
    })
    cy.get('[aria-label="Search matches"]').should(($status) => {
      const [position, count] = $status.text().trim().split(' / ').map(Number)
      expect(count, 'current-story matches').to.be.greaterThan(1)
      expect(position, 'previous from first match wraps to last').to.equal(count)
    })
    cy.get('@canonicalUrl').then(url => cy.location('href').should('equal', url))
    cy.get('@canonicalDocument').then(document => cy.get(primaryPreviewFrame).its('0.contentDocument').should('equal', document))
    // Match reveal intentionally leaves nonmatching canonical frame offscreen.
    // Its document stays authoritative without requiring canvas visibility.
    cy.get('@canonicalDocument').its('body').then(cy.wrap).contains('h1', 'Title')
  })

  it('retains expanded source and copies current content after unrelated theme publication', () => {
    cy.visit(demo)
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.window().then((window) => {
      cy.stub(window.navigator.clipboard, 'writeText').resolves().as('sourceClipboard')
    })
    getGeneratedSource().should('contain', 'Hello world!').invoke('text').as('currentSource')
    cy.get('.histoire-provider').invoke('attr', 'data-histoire-appearance').then((appearance) => {
      cy.get('[aria-label="Workbench"] [aria-label="Toggle dark mode"]').click()
      cy.get('.histoire-provider').should('not.have.attr', 'data-histoire-appearance', appearance)
    })
    cy.get('@currentSource').then((source) => {
      cy.get('[data-test-id="story-source-code"] pre code').should('have.text', source)
      cy.get('[aria-label="Copy source"]').should('not.be.disabled').click()
      cy.get('@sourceClipboard').should('have.been.calledOnceWithExactly', source)
      cy.get('[aria-label="Source copied"]').should('be.visible')
    })
  })

  it('retains docs-only Markdown scroll and title after unrelated theme publication', () => {
    cy.visit('/story/src-longfile1-story-js?variantId')
    cy.contains(`${docs} h1`, 'How to write stories?').should('be.visible')
    cy.get('main[data-histoire-docs-scroll]').scrollTo(0, 400).invoke('prop', 'scrollTop').should('be.greaterThan', 300).then((scrollTop) => {
      cy.get('[aria-label="Workbench"] [aria-label="Toggle dark mode"]').click()
      cy.get('main[data-histoire-docs-scroll]').should(($page) => {
        expect($page[0].scrollTop, 'same rendered document scroll').to.be.closeTo(scrollTop, 1)
      })
      cy.get(`${docs} h1`).should('have.length', 1).and('contain', 'How to write stories?')
      cy.get('.histoire-markdown-path').should('contain', 'src/LongFile1.story.md')
    })
  })

  it('applies advertised numeric finite control as a number in actual preview', () => {
    cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId=default')
    cy.getPreviewIframeBody().find('[data-test-id="matrix-values"]').should('have.attr', 'data-level', '1').and('have.attr', 'data-level-type', 'number')
    cy.contains('[data-test-id="story-controls"] [role="group"][aria-label="level"] button', /^2$/).scrollIntoView().should(($button) => {
      const button = $button[0].getBoundingClientRect()
      const viewport = $button[0].closest('[role="tabpanel"]').getBoundingClientRect()
      expect(button.left, 'native control fits inspector').to.be.at.least(viewport.left)
      expect(button.right, 'native control remains reachable').to.be.at.most(viewport.right)
      expect(button.top, 'native control revealed vertically').to.be.at.least(viewport.top)
      expect(button.bottom).to.be.at.most(viewport.bottom)
    }).click()
    cy.getPreviewIframeBody().find('[data-test-id="matrix-values"]').should('have.attr', 'data-level', '2').and('have.attr', 'data-level-type', 'number')
    cy.get('[aria-label="Remove level override"]').should('not.be.disabled').click()
    cy.getPreviewIframeBody().find('[data-test-id="matrix-values"]').should('have.attr', 'data-level', '1').and('have.attr', 'data-level-type', 'number')
  })

  it('changes fixed list height with Compact while preserving gaps and distant recycled focus', () => {
    cy.viewport(1280, 600)
    cy.visit('/settings/appearance')
    cy.contains('[aria-label="Density"] button', /^Comfortable$/).click().should('have.attr', 'aria-pressed', 'true')
    cy.visit(demo)
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[aria-label="Story tree"]').should('be.visible')
    cy.get('[aria-label="Story tree"] [role="treeitem"]').first().should(($row) => {
      expect($row[0].getBoundingClientRect().height).to.equal(31)
    })
    assertTreeGaps()
    cy.visit('/settings/appearance')
    cy.contains('[aria-label="Density"] button', /^Compact$/).click().should('have.attr', 'aria-pressed', 'true')
    cy.visit(demo)
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[aria-label="Story tree"]').should('be.visible')
    cy.get('[aria-label="Story tree"] [role="treeitem"]').first().should(($row) => {
      expect($row[0].getBoundingClientRect().height).to.equal(27)
    })
    assertTreeGaps()
    cy.location('href').as('densitySelection')
    cy.get('.stories-count').invoke('text').then((count) => {
      cy.get('[aria-label="Story tree"] [role="treeitem"]').should('have.length.lessThan', Number.parseInt(count, 10))
    })
    cy.get('[aria-label="Story tree"] [role="treeitem"]').first().invoke('attr', 'data-tree-key').then((firstKey) => {
      cy.get('[aria-label="Story tree"] [role="treeitem"]').first().focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'End' })
      // Reacquire focused DOM after asynchronous recycler reveal, not initial string snapshot.
      cy.focused().should(($row) => {
        expect($row.attr('role')).to.equal('treeitem')
        expect($row.attr('data-tree-key')).not.to.equal(firstKey)
      })
      cy.get('[aria-label="Story tree"] [role="treeitem"]').last().invoke('attr', 'data-tree-key').then((lastKey) => {
        cy.focused().should('have.attr', 'data-tree-key', lastKey)
      })
      cy.focused().should('be.visible').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Home' })
      cy.focused().should('have.attr', 'data-tree-key', firstKey).and('be.visible')
    })
    assertTreeGaps()
    cy.get('@densitySelection').then(url => cy.location('href').should('equal', url))
    cy.getPreviewIframeBody().contains('Hello world!')
  })

  if (Cypress.env('workbenchMode') === 'dev') {
    it('captures distinct PNG pixels for matrix cells sharing same base variant', () => {
      cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId=default&rows=enabled&cols=emphasized', {
        onBeforeLoad(window) {
          cy.spy(window.WebSocket.prototype, 'send').as('screenshotWire')
        },
      })
      cy.getPreviewIframeBody().contains('Matrix message')
      cy.get('[aria-label="Props matrix"]').should('not.be.disabled').click()
      cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
      cy.contains('[aria-label="Matrix base props"] .histoire-matrix-base-prop', 'message').find('input').clear().type('Matrix capture override')
      observeScreenshotReplies()
      captureMatrixCell(false, 'plainMatrixPng')
      captureMatrixCell(true, 'emphasizedMatrixPng')
      cy.get('@plainMatrixPng').then((plain) => {
        cy.get('@emphasizedMatrixPng').should('not.equal', plain)
      })
      cy.location('search').should('include', 'variantId=default').and('include', 'arrange=matrix')
    })
  }
})
