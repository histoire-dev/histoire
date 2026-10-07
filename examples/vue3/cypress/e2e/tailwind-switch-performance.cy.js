/// <reference types="cypress" />

import { getSelectedPreviewIframe } from '../../../cypress/frame-commands.js'

const tailwind = '/story/tailwind?variantId=border-color&arrange=single'

/** Opens one generated Tailwind category with deterministic canvas settings. */
function visitTailwind(path = tailwind) {
  cy.viewport(1400, 900)
  cy.visit(path, {
    onBeforeLoad(window) {
      window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ version: 3, zoomByArrange: { single: 'fit', grid: 'fit', list: 'selection', matrix: 'fit' }, tool: 'select', frameBackground: 'transparent' }))
      window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
    },
  })
  getSelectedPreviewIframe()
}

/** Selects generated Tailwind category by its accessible story-tree label. */
function selectCategory(label, id) {
  cy.get(`[data-test-id="story-list-variant"][aria-label="${label}"]`).click()
  cy.location('search').should('include', `variantId=${id}`)
  cy.getPreviewIframeBody()
}

/** Sets shared canvas background through toolbar. */
function setBackground(label) {
  cy.get('button[aria-label="Background"][aria-haspopup="dialog"]').click()
  cy.get(`[role="dialog"][aria-label="Background"] button[aria-label="${label}"]`).click()
  cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
}

/** Checks shared canvas background remains applied after switching variants. */
function expectBackground(label) {
  cy.get('button[aria-label="Background"][aria-haspopup="dialog"]').click()
  cy.get(`[role="dialog"][aria-label="Background"] button[aria-label="${label}"]`).should('have.attr', 'aria-pressed', 'true')
  cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
}

/** Confirms host retained same iframe and physical document after a selection. */
function expectCanvasDocument(iframe, document) {
  getSelectedPreviewIframe().should(($frame) => {
    expect($frame[0]).to.equal(iframe)
    expect($frame[0].contentDocument).to.equal(document)
  })
}

/** Reads a CSS repeat count or counts resolved columns for a virtual grid row. */
function gridColumnCount(row) {
  const template = row.ownerDocument.defaultView.getComputedStyle(row).gridTemplateColumns.trim()
  const repeated = template.match(/^repeat\((\d+),/)
  return repeated ? Number(repeated[1]) : template.split(/\s+/).filter(Boolean).length
}

/** Scroll the retained canvas document using its native iframe viewport. */
function scrollPreviewToBottom() {
  getSelectedPreviewIframe().then(($frame) => {
    const doc = $frame[0].contentDocument
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
    $frame[0].contentWindow.scrollTo(0, height)
  })
}

describe('Tailwind variant switching', () => {
  it('retains one canvas document and restores each variant state through A/B/A', () => {
    visitTailwind()
    getSelectedPreviewIframe().then(($frame) => {
      const iframe = $frame[0]
      const document = iframe.contentDocument

      cy.getControlsIframeBody().find('input').first().clear().type('border-red-500')
      cy.getPreviewIframeBody().find('[data-tailwind-token]').should('have.length', 1)
      setBackground('Dark gray')

      selectCategory('Text Color', 'text-color')
      expectCanvasDocument(iframe, document)
      cy.getControlsIframeBody().find('textarea').first().clear().type('Retained typography sample')
      cy.getPreviewIframeBody().find('[data-tailwind-value]').first().should('contain', 'Retained typography sample')

      selectCategory('Border Color', 'border-color')
      expectCanvasDocument(iframe, document)
      cy.getControlsIframeBody().find('input').first().should('have.value', 'border-red-500')
      cy.getPreviewIframeBody().find('[data-tailwind-token]').should('have.length', 1)
      expectBackground('Dark gray')

      selectCategory('Text Color', 'text-color')
      expectCanvasDocument(iframe, document)
      cy.getControlsIframeBody().find('textarea').first().should('have.value', 'Retained typography sample')
      cy.getPreviewIframeBody().find('[data-tailwind-value]').first().should('contain', 'Retained typography sample')
      expectBackground('Dark gray')
    })
  })

  it('bounds rendered color tokens while preserving native scroll, filtering, focus, and copy', () => {
    visitTailwind('/story/tailwind?variantId=background-color&arrange=single')
    getSelectedPreviewIframe().then(($frame) => {
      const iframe = $frame[0]
      const document = iframe.contentDocument
      let previousColumns
      const finalTokenKey = 'code'

      cy.getPreviewIframeBody().find('[data-tailwind-token]').its('length').should('be.lessThan', 80)
      cy.getPreviewIframeBody().find('[data-token-virtual-key] button[aria-label="Copy token name"]').first().focus()
      scrollPreviewToBottom()
      cy.getPreviewIframeBody().find('[data-tailwind-token]').last().should(($token) => {
        expect($token.attr('data-tailwind-token')).to.equal('htw-bg-code')
        expect($token.closest('[data-token-virtual-key]').attr('data-token-virtual-key')).to.equal(finalTokenKey)
        const rect = $token[0].getBoundingClientRect()
        expect(rect.bottom).to.be.greaterThan(0)
        expect(rect.top).to.be.lessThan(document.defaultView.innerHeight)
      })
      getSelectedPreviewIframe().then(($selected) => {
        const doc = $selected[0].contentDocument
        expect(doc.activeElement, 'focused action stays live while its row is virtualized away').not.to.equal(doc.body)
        expect(doc.activeElement.isConnected, 'focused action stays mounted').to.equal(true)
        expect(doc.defaultView.scrollY + doc.documentElement.scrollTop + doc.body.scrollTop, 'native iframe document scrolls').to.be.greaterThan(0)
      })

      cy.getPreviewIframeBody().find(`[data-token-virtual-key="${finalTokenKey}"] button[aria-label="Copy token name"]`).focus()
      cy.getPreviewIframeBody().find(`[data-token-virtual-key="${finalTokenKey}"]`).closest('[data-token-virtual-row]').then(($row) => {
        previousColumns = gridColumnCount($row[0])
      })
      cy.viewport(1000, 800)
      cy.getPreviewIframeBody().find(`[data-token-virtual-key="${finalTokenKey}"] button[aria-label="Copy token name"]`).should(($button) => {
        const doc = $button[0].ownerDocument
        const activeCell = doc.activeElement.closest('[data-token-virtual-key]')
        expect(activeCell?.getAttribute('data-token-virtual-key'), 'focus follows logical token across reflow').to.equal(finalTokenKey)
        expect(doc.activeElement.isConnected, 'focused action stays mounted after reflow').to.equal(true)
        const row = $button[0].closest('[data-token-virtual-row]')
        const nextColumns = gridColumnCount(row)
        expect(nextColumns, 'responsive grid changes column count').not.to.equal(previousColumns)
        const scrollHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
        const viewportBottom = doc.defaultView.scrollY + doc.defaultView.innerHeight
        expect(doc.defaultView.scrollY, 'resize does not jump back to top').to.be.greaterThan(0)
        expect(viewportBottom, 'native scroll anchoring keeps last row near bottom').to.be.greaterThan(scrollHeight - 300)
      })
      cy.getPreviewIframeBody().find('[data-tailwind-token]').last().should(($token) => {
        expect($token.attr('data-tailwind-token')).to.equal('htw-bg-code')
        const rect = $token[0].getBoundingClientRect()
        expect(rect.bottom).to.be.greaterThan(0)
        expect(rect.top).to.be.lessThan(document.defaultView.innerHeight)
      })

      cy.getControlsIframeBody().find('input').first().clear().type('bg-yellow-950')
      cy.getPreviewIframeBody().find('[data-tailwind-token]').should('have.length', 1)
      cy.getPreviewIframeBody().find('[data-tailwind-token]').first().should('have.attr', 'data-tailwind-token').and('include', 'bg-yellow-950')
      getSelectedPreviewIframe().then(($selected) => {
        const clipboard = $selected[0].contentWindow.navigator.clipboard
        expect(clipboard?.writeText, 'sandbox clipboard API').to.be.a('function')
        cy.stub(clipboard, 'writeText').resolves().as('tokenClipboard')
      })
      cy.getPreviewIframeBody().find('button[aria-label="Copy token name"]').click()
      cy.get('@tokenClipboard').should('have.been.calledWith', 'htw-bg-yellow-950')
      cy.getPreviewIframeBody().find('[data-token-virtual-key] button[aria-label="Copied"]').should('exist')

      cy.getControlsIframeBody().find('input').first().clear()
      cy.getPreviewIframeBody().find('[data-tailwind-token]').its('length').should('be.lessThan', 80)
      expectCanvasDocument(iframe, document)
    })
  })

  it('keeps viewport populated and keyboard focus on its logical token across responsive regrouping', () => {
    visitTailwind('/story/tailwind?variantId=background-color&arrange=single')
    getSelectedPreviewIframe().then(($frame) => {
      const doc = $frame[0].contentDocument
      const view = doc.defaultView
      const pageHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
      view.scrollTo(0, Math.floor((pageHeight - view.innerHeight) * 0.55))
    })

    let focusedKey
    let previousColumns
    getSelectedPreviewIframe().should(($frame) => {
      const doc = $frame[0]?.contentDocument
      expect(Boolean(doc?.body), 'selected story document body exists').to.equal(true)
      const visibleTokens = [...doc.querySelectorAll('[data-tailwind-token]')]
        .filter((token) => {
          const rect = token.getBoundingClientRect()
          return rect.top >= 0 && rect.bottom <= doc.defaultView.innerHeight
        })
      expect(visibleTokens.length, 'virtual rows fill middle viewport after native scroll').to.be.greaterThan(1)
    })
    getSelectedPreviewIframe().then(($frame) => {
      const doc = $frame[0].contentDocument
      const visibleTokens = [...doc.querySelectorAll('[data-tailwind-token]')]
        .filter((token) => {
          const rect = token.getBoundingClientRect()
          return rect.top >= 0 && rect.bottom <= doc.defaultView.innerHeight
        })
      const anchor = visibleTokens[0]
      const anchorCell = anchor.closest('[data-token-virtual-key]')
      const focusedCell = visibleTokens.find(token => token.closest('[data-token-virtual-key]') !== anchorCell)?.closest('[data-token-virtual-key]')
      expect(Boolean(anchorCell), 'first visible token has a stable key').to.equal(true)
      expect(Boolean(focusedCell), 'a different visible token is available for focus').to.equal(true)
      focusedKey = focusedCell.getAttribute('data-token-virtual-key')
      const row = focusedCell.closest('[data-token-virtual-row]')
      previousColumns = gridColumnCount(row)
      cy.wrap(focusedCell.querySelector('button[aria-label="Copy token name"]')).focus()
    })
    cy.viewport(1000, 800)
    getSelectedPreviewIframe().should(($frame) => {
      const doc = $frame[0].contentDocument
      const visibleTokens = [...doc.querySelectorAll('[data-tailwind-token]')]
        .filter((token) => {
          const rect = token.getBoundingClientRect()
          return rect.bottom > 0 && rect.top < doc.defaultView.innerHeight
        })
      const focusedCell = doc.activeElement.closest('[data-token-virtual-key]')
      const row = doc.activeElement.closest('[data-token-virtual-row]')
      const nextColumns = gridColumnCount(row)
      expect(focusedCell?.getAttribute('data-token-virtual-key'), 'focus stays on separate logical token').to.equal(focusedKey)
      expect(nextColumns, 'responsive grid regrouped rows').not.to.equal(previousColumns)
      expect(visibleTokens.length, 'native resize leaves story content in viewport').to.be.greaterThan(0)
      expect(doc.defaultView.scrollY, 'viewport stays away from top').to.be.greaterThan(0)
    })
  })
})
