/// <reference types="cypress" />

import { primaryPreviewFrame } from './workbench-contract.js'
import { getSelectedPreviewIframe } from './frame-commands.js'

/** Opens Home and reveals Stories without toggling an already expanded pane closed. */
export function visitStories() {
  cy.visit('/')
  cy.get('[aria-label="Workbench"] [aria-label="Home"]').click()
  cy.get('[aria-label="stories panel"]').should('be.visible')
}

/**
 * Selects a frame through its accessible chrome and verifies canonical routing.
 * @param {string} title Collected variant title.
 * @param {string} variantId Collected variant identity.
 */
export function selectCanvasVariant(title, variantId) {
  cy.contains('[data-frame-id] > button', title).click()
  cy.location('search').should('include', `variantId=${encodeURIComponent(variantId)}`)
}

/**
 * Returns selected retained document or admitted passive frame document.
 * @param {string} storyId Exact collected story identity.
 * @param {string} variantId Exact collected variant identity.
 */
export function getCanvasVariantBody(storyId, variantId) {
  const key = JSON.stringify([storyId, variantId])
  return cy.get(`[data-frame-id='${key}']`).then(($frame) => {
    const selected = $frame.children('button').attr('aria-pressed') === 'true'
    return (selected ? getSelectedPreviewIframe() : cy.wrap($frame).find('iframe[title="Histoire preview"]'))
      .its('0.contentDocument.body')
      .should('not.be.empty')
      .then(cy.wrap)
  })
}

/** Expands source only when collapsed, preserving active generated source mode. */
export function getGeneratedSource() {
  // Chained DOM traversal resets Cypress's timeout; wait canonical admission directly.
  cy.get(primaryPreviewFrame, { timeout: 20000 }).should('be.visible')
  cy.getPreviewIframeBody({ timeout: 20000 })
  cy.get('[aria-label="Source"]').then(($source) => {
    if ($source.find('[aria-label="Expand source"]').length) {
      cy.get('[aria-label="Expand source"]').click()
    }
  })
  return cy.get('[data-test-id="story-source-code"] pre code', { timeout: 20000 })
}

/** Select original value through shared menu's accessible option label. */
export function selectControl(label, option) {
  cy.get(`button[aria-label="${label}"][aria-haspopup="listbox"]`).click()
  cy.contains('[role="listbox"] [role="option"]', new RegExp(`^${option}$`)).click()
}

/** Start a point comment using selected preview's real canvas coordinates. */
export function beginCommentDraft() {
  cy.get('[aria-label="Comment for AI"]').should('not.be.disabled').click()
  cy.get(primaryPreviewFrame).then(($frame) => {
    const rect = $frame[0].getBoundingClientRect()
    cy.get('[aria-label="Story canvas"]').trigger('pointerdown', {
      eventConstructor: 'PointerEvent',
      pointerId: 9,
      button: 0,
      clientX: rect.x + 30,
      clientY: rect.y + 30,
      force: true,
    })
  })
  cy.get('[aria-label="Comment message"]').should('be.focused')
}

/**
 * Leaves Settings through one rail pane while retaining canonical selection.
 * @param {{ path: string, previewText: string, label: string, panel: string }} options Story and pane acceptance fixture.
 */
export function restoreWorkspacePaneFromSettings(options) {
  cy.visit(options.path)
  cy.getPreviewIframeBody().contains(options.previewText)
  cy.get('[aria-label="Workbench"] [aria-label="Settings"]').click()
  cy.location('pathname').should('match', /^\/settings\//)
  cy.get('[aria-label="stories panel"]').should('not.exist')
  cy.get(`[aria-label="Workbench"] [aria-label^="${options.label}"]`).click()
  cy.location('pathname').should('equal', options.path.split('?')[0])
  cy.location('search').should('equal', `?${options.path.split('?')[1]}`)
  cy.get(`[aria-label="${options.panel} panel"]`).should('be.visible')
}
