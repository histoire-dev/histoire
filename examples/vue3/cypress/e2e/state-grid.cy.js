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
})
