/// <reference types="cypress" />

describe('State Options API', () => {
  beforeEach(() => {
    cy.visit('/story/src-components-stateoption-story-vue?variantId=src-components-stateoption-story-vue-0')
  })

  it('syncs state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"optionApiData": "OPTION API"')
    cy.get('[data-test-id="story-controls"]').get('input[type="text"]').clear().type('Meow')
    cy.getPreviewIframeBody().find('.state-output').contains('"optionApiData": "Meow"')
  })
})

describe('State Setup API', () => {
  beforeEach(() => {
    cy.visit('/story/src-components-statesetup-story-vue?variantId=src-components-statesetup-story-vue-0')
  })

  it('syncs state', () => {
    cy.getPreviewIframeBody().find('pre').contains('"count": 0')
    cy.getPreviewIframeBody().find('pre').contains('"text": "Meow"')
    cy.get('[data-test-id="story-controls"] .controls').contains('+1').click().click()
    cy.get('[data-test-id="story-controls"] input[type="text"]').eq(0).clear().type('Waf')
    cy.getPreviewIframeBody().find('pre').contains('"count": 2')
    cy.getPreviewIframeBody().find('pre').contains('"text": "Waf"')
  })
})

describe('State Setup API (2)', () => {
  beforeEach(() => {
    cy.visit('/story/src-components-statesetup2-story-vue?variantId=src-components-statesetup2-story-vue-0')
  })

  it('syncs state', () => {
    cy.getPreviewIframeBody().find('pre').contains('"count": 0')
    cy.getPreviewIframeBody().find('pre').contains('"text": "Meow"')
    cy.get('[data-test-id="story-controls"] .controls').contains('+1').click().click()
    cy.get('[data-test-id="story-controls"] input[type="text"]').eq(0).clear().type('Waf')
    cy.getPreviewIframeBody().find('pre').contains('"count": 2')
    cy.getPreviewIframeBody().find('pre').contains('"text": "Waf"')
  })
})
