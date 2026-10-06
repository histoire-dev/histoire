/// <reference types="cypress" />

import { getCanvasVariantBody, selectCanvasVariant } from '../../../cypress/workbench-actions.js'

describe('Grid state isolation', () => {
  const storyPath = '/story/src-components-sharedcontrols-story-vue?variantId=src-components-sharedcontrols-story-vue-0'

  /** Reads each independent canvas document instead of legacy in-frame cards. */
  const getVariantCard = variantId => getCanvasVariantBody('src-components-sharedcontrols-story-vue', variantId)

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
    cy.getPreviewIframeBody().contains('Variant 1')
  })

  it('routes panel edits to selected grid variant only', () => {
    const thirdVariantId = 'src-components-sharedcontrols-story-vue-2'

    selectCanvasVariant('variant 3', thirdVariantId)
    cy.location('search').should('include', `variantId=${thirdVariantId}`)

    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Gamma')

    getVariantCard('src-components-sharedcontrols-story-vue-0')
      .find('[data-test-id="shared-controls-state"]')
      .should('not.contain', 'Gamma')
    getVariantCard('src-components-sharedcontrols-story-vue-1')
      .find('[data-test-id="shared-controls-state"]')
      .should('not.contain', 'Gamma')
    getVariantCard(thirdVariantId)
      .find('[data-test-id="shared-controls-state"]')
      .should('contain', 'Gamma')
  })

  it('keeps story-level controls isolated per variant across selections', () => {
    const firstVariantId = 'src-components-sharedcontrols-story-vue-0'
    const thirdVariantId = 'src-components-sharedcontrols-story-vue-2'

    selectCanvasVariant('variant 3', thirdVariantId)
    cy.get('iframe[title="Histoire custom controls"]').should(($frame) => {
      expect(new URL($frame[0].contentWindow.location.href).searchParams.get('variantId')).to.equal(thirdVariantId)
    })
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Gamma')
    // Canonical edits acknowledge asynchronously through current controls document.
    getVariantCard(thirdVariantId).find('[data-test-id="shared-controls-state"]').should('contain', 'Gamma')

    selectCanvasVariant('variant 1', firstVariantId)
    cy.location('search').should('include', `variantId=${firstVariantId}`)
    cy.get('iframe[title="Histoire custom controls"]').should(($frame) => {
      expect(new URL($frame[0].contentWindow.location.href).searchParams.get('variantId')).to.equal(firstVariantId)
    })
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Alpha')

    getVariantCard(firstVariantId)
      .find('[data-test-id="shared-controls-state"]')
      .should('contain', 'Alpha')
    getVariantCard(thirdVariantId)
      .find('[data-test-id="shared-controls-state"]')
      .should('contain', 'Gamma')
  })

  it('retains ready replica document when selected from canvas chrome', () => {
    const thirdVariantId = 'src-components-sharedcontrols-story-vue-2'
    const key = JSON.stringify(['src-components-sharedcontrols-story-vue', thirdVariantId])
    const thirdFrame = () => cy.get('[data-frame-id]', { timeout: 20000 })
      .filter((_, element) => element.getAttribute('data-frame-id') === key)

    thirdFrame().find('iframe[data-test-id="preview-iframe-passive"]').should('be.visible').then(($iframe) => {
      cy.wrap($iframe[0]).as('retainedPreview')
    })
    thirdFrame().children('button').contains(/^variant 3$/).click()
    cy.location('search').should('include', `variantId=${thirdVariantId}`)
    thirdFrame().children('button').should('have.attr', 'aria-pressed', 'true')
    cy.get('@retainedPreview').then((iframe) => {
      thirdFrame().find('iframe[title="Histoire preview"]').should(($current) => {
        expect($current[0]).to.equal(iframe[0] ?? iframe)
      })
    })
    cy.get('[data-test-id="story-side-panel"] h2').should('have.text', 'variant 3')
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Retained document')
    cy.getPreviewIframeBody().find('[data-test-id="shared-controls-state"]').should('contain', 'Retained document')
  })
})

describe('Variant document retention', () => {
  const storyId = 'src-components-codegen-story-vue'

  /** Read one exact document without relying on selected iframe ordering. */
  const frame = variantId => cy.get(`[data-frame-id='${JSON.stringify([storyId, variantId])}']`)

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(`/story/${storyId}?variantId=html`, {
      onBeforeLoad(window) {
        window.localStorage.setItem('_histoire-ui-canvas', JSON.stringify({ zoom: 0.5 }))
        window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: false }))
      },
    })
    cy.getPreviewIframeBody().find('input[placeholder="Enter your phone number"]').type('123456')
    for (const variantId of ['html', 'props']) {
      frame(variantId).find('iframe').should('be.visible').then(($iframe) => {
        const iframe = $iframe[0]
        cy.wrap({ iframe, document: iframe.contentDocument, documentId: new URL(iframe.src).searchParams.get('documentId') }).as(variantId)
      })
    }
  })

  /** Both predecessor and destination must retain actual source-owned documents. */
  function retainedDocuments() {
    for (const variantId of ['html', 'props']) {
      cy.get(`@${variantId}`).then((original) => {
        frame(variantId).find('iframe').should(($iframe) => {
          expect($iframe[0]).to.equal(original.iframe)
          expect($iframe[0].isConnected).to.equal(true)
          expect($iframe[0].contentDocument).to.equal(original.document)
          expect(new URL($iframe[0].src).searchParams.get('documentId')).to.equal(original.documentId)
        })
      })
    }
    getCanvasVariantBody(storyId, 'html').find('input[placeholder="Enter your phone number"]').should('have.value', '123456')
  }

  it('retains first and destination variants through canvas, Back and Forward selections', () => {
    getCanvasVariantBody(storyId, 'props').find('input').first().click()
    cy.location('search').should('include', 'variantId=props')
    retainedDocuments()
    getCanvasVariantBody(storyId, 'html').find('input[placeholder="Enter your phone number"]').click()
    cy.location('search').should('include', 'variantId=html')
    retainedDocuments()
    cy.go('back')
    cy.location('search').should('include', 'variantId=props')
    retainedDocuments()
    cy.go('forward')
    cy.location('search').should('include', 'variantId=html')
    retainedDocuments()
  })

  it('retains admitted documents through sidebar and search selections', () => {
    cy.contains('[data-test-id="story-list-variant"]', /^props$/).click()
    cy.location('search').should('include', 'variantId=props')
    retainedDocuments()
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').click()
    cy.get('[aria-label="Search stories, docs and props"]').type('html')
    cy.contains('[data-test-id="search-item"][data-search-kind="variant"] strong', /Code gen › html$/).click()
    cy.location('search').should('include', 'variantId=html')
    retainedDocuments()
  })
})

describe('Inspector controls readiness', () => {
  it('shows loading skeleton until first variant resolves authored controls', () => {
    cy.viewport(1600, 1000)
    cy.intercept({ pathname: '/__sandbox.html', query: { controls: 'true' } }, (request) => {
      request.continue(response => response.setDelay(2500))
    })
    cy.visit('/story/src-components-basebutton-story-vue?variantId=src-components-basebutton-story-vue-0')
    cy.get('[data-test-id="story-controls"] [role="status"][aria-label="Loading controls"]').should('be.visible')
    cy.get('[data-test-id="story-controls"] input, [data-test-id="story-controls"] textarea').should('not.exist')
    cy.screenshot('inspector-controls-loading', { disableTimersAndAnimations: false })
    cy.getControlsIframeBody({ timeout: 20000 }).find('button[aria-label="Color"]').should('contain', 'Default')
    cy.get('[data-test-id="story-controls"] [aria-label="Loading controls"]').should('not.exist')
    cy.get('[data-test-id="story-controls"] textarea').should('not.exist')
  })
})
