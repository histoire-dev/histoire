/// <reference types="cypress" />

describe('Grid state isolation', () => {
  const storyPath = '/story/src-components-sharedcontrols-story-vue?variantId=src-components-sharedcontrols-story-vue-0'

  const getVariantCard = variantId => cy.getPreviewIframeBody()
    .find(`[data-histoire-variant-id="${variantId}"]`)

  beforeEach(() => {
    cy.viewport(1600, 1000)
    cy.visit(storyPath)
  })

  it('routes panel edits to selected grid variant only', () => {
    const thirdVariantId = 'src-components-sharedcontrols-story-vue-2'

    getVariantCard(thirdVariantId).contains('variant 3').click()
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

    getVariantCard(thirdVariantId).contains('variant 3').click()
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Gamma')

    getVariantCard(firstVariantId).contains('variant 1').click()
    cy.location('search').should('include', `variantId=${firstVariantId}`)
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Alpha')

    getVariantCard(firstVariantId)
      .find('[data-test-id="shared-controls-state"]')
      .should('contain', 'Alpha')
    getVariantCard(thirdVariantId)
      .find('[data-test-id="shared-controls-state"]')
      .should('contain', 'Gamma')
  })
})
