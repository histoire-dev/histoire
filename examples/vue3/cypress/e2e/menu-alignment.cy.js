/// <reference types="cypress" />

const codegen = '/story/src-components-codegen-story-vue?variantId=html'

/**
 * Returns rendered left edge for exact visible text inside one interactive row.
 * Ranges measure text itself, avoiding assertions about implementation classes.
 *
 * @param {HTMLElement} row interactive row containing label text
 * @param {string} label exact text to measure
 * @returns {number} rendered inline-start edge in CSS pixels
 */
function textLeft(row, label) {
  const texts = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  let node = texts.nextNode()
  while (node) {
    if (node.textContent?.trim() === label) {
      const range = document.createRange()
      range.selectNodeContents(node)
      return range.getBoundingClientRect().left
    }
    node = texts.nextNode()
  }
  throw new Error(`Missing visible menu text: ${label}`)
}

/**
 * Verifies rows expose one stable text column despite differing trailing metadata.
 *
 * @param {HTMLElement} menu containing rows
 * @param {string[]} labels exact labels to compare
 */
function assertAlignedText(menu, labels) {
  const rows = [...menu.querySelectorAll('button')]
  const positions = labels.map((label) => {
    const row = rows.find(item => item.textContent?.trim().startsWith(label))
    if (!row) throw new Error(`Missing menu row: ${label}`)
    return textLeft(row, label)
  })
  for (const position of positions.slice(1)) {
    // Glyph side bearings can shift range bounds by a fractional pixel.
    expect(position).to.be.closeTo(positions[0], 0.5)
  }
}

for (const colorScheme of ['light', 'dark']) {
  describe(`workbench menu alignment in ${colorScheme} mode`, () => {
    beforeEach(() => {
      cy.viewport(1600, 1000)
      cy.visit(codegen, {
        onBeforeLoad(window) {
          window.localStorage.setItem('histoire-color-scheme', colorScheme)
          window.sessionStorage.setItem('histoire-color-scheme', colorScheme)
        },
      })
      cy.getPreviewIframeBody().contains('h1', 'Title')
    })

    it('keeps Zoom labels left-aligned when only Actual size has a shortcut', () => {
      cy.get('[aria-label="Zoom level"]').click()
      cy.get('[role="dialog"][aria-label="Zoom level"]').should(($menu) => {
        assertAlignedText($menu[0], ['25%', '50%', '100%', '200%'])
      })
    })

    it('keeps frame-action labels aligned with and without shortcut metadata', () => {
      cy.get('.histoire-canvas-frame.is-selected').rightclick({ force: true })
      cy.get('[role="menu"]').should(($menu) => {
        assertAlignedText($menu[0], ['Copy source', 'Copy link'])
      })
    })
  })
}
