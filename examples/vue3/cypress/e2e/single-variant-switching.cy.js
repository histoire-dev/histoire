/// <reference types="cypress" />

import { getSelectedPreviewIframe } from '../../../cypress/frame-commands.js'
import { visitSingle } from '../../../cypress/single-variant.js'

/** Exercise router navigation without reloading the workbench document. */
function selectVariant(storyId, index) {
  const variantId = `${storyId}-${index}`
  cy.window().then((window) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variantId', variantId)
    window.history.pushState({ ...window.history.state, current: url.pathname + url.search, position: (window.history.state?.position ?? 0) + 1 }, '', url)
    window.dispatchEvent(new window.PopStateEvent('popstate', { state: window.history.state }))
  })
  cy.get('[data-frame-id]').should('have.attr', 'data-frame-id', JSON.stringify([storyId, variantId]))
  getSelectedPreviewIframe()
}

/** Assert physical document survives, not only its iframe element or WindowProxy. */
function expectDocument(iframe, document) {
  getSelectedPreviewIframe().should(($frame) => {
    expect($frame[0]).to.equal(iframe)
    expect($frame[0].contentDocument).to.equal(document)
  })
  cy.get('[data-frame-id] iframe').should('have.length', 1)
}

describe('Single variant document reuse', () => {
  it('retains one document, editable state, and current controls across A/B/A', () => {
    const story = 'src-components-state-story-vue'
    visitSingle(`/story/${story}?variantId=${story}-0&arrange=single`)
    getSelectedPreviewIframe().then(($frame) => {
      const iframe = $frame[0]
      const document = iframe.contentDocument
      cy.getPreviewIframeBody().find('input:not([type="number"])').clear().type('Retained A')
      selectVariant(story, 1)
      expectDocument(iframe, document)
      cy.getPreviewIframeBody().find('input').should('have.value', 'bar').clear().type('Retained B')
      selectVariant(story, 0)
      expectDocument(iframe, document)
      cy.getPreviewIframeBody().find('input:not([type="number"])').should('have.value', 'Retained A')
      selectVariant(story, 1)
      expectDocument(iframe, document)
      cy.getPreviewIframeBody().find('input').should('have.value', 'Retained B')
      cy.get('[aria-label="Show inspector"]').click()
      cy.getControlsIframeBody().find('input').first().clear().type('Control edit')
      cy.getPreviewIframeBody().find('input').should('have.value', 'Control edit')
    })
  })

  it('retains mocked story document and restores edited custom controls', () => {
    const story = 'src-components-vitestmocking-story-vue'
    visitSingle(`/story/${story}?variantId=${story}-0&arrange=single`)
    getSelectedPreviewIframe().then(($frame) => {
      const iframe = $frame[0]
      const document = iframe.contentDocument
      cy.getPreviewIframeBody().should('contain', 'Mocked by Vitest')
      selectVariant(story, 1)
      expectDocument(iframe, document)
      cy.get('[aria-label="Show inspector"]').click()
      cy.getControlsIframeBody().find('input').first().clear().type('Retained mock')
      cy.getPreviewIframeBody().find('[data-test-id="controlled-name"]').should('contain', 'Retained mock')
      selectVariant(story, 0)
      expectDocument(iframe, document)
      cy.getPreviewIframeBody().should('contain', 'Mocked by Vitest')
      selectVariant(story, 1)
      expectDocument(iframe, document)
      cy.getPreviewIframeBody().find('[data-test-id="controlled-name"]').should('contain', 'Retained mock')
      cy.getControlsIframeBody().find('input').first().should('have.value', 'Retained mock')
    })
  })
})
