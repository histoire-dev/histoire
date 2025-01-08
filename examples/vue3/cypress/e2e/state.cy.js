/// <reference types="cypress" />

describe('State Options API', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  beforeEach(() => {
    cy.visit('/story/src-components-stateoption-story-vue?variantId=src-components-stateoption-story-vue-0')
  })

  it('syncs state', () => {
    getIframeBody().find('.state-output').contains('"optionApiData": "OPTION API"')
    cy.get('[data-test-id="story-controls"]').get('input[type="text"]').clear().type('Meow')
    getIframeBody().find('.state-output').contains('"optionApiData": "Meow"')
  })
})

describe('State Setup API', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  beforeEach(() => {
    cy.visit('/story/src-components-statesetup-story-vue?variantId=src-components-statesetup-story-vue-0')
  })

  it('syncs state', () => {
    getIframeBody().find('pre').contains('"count": 0')
    getIframeBody().find('pre').contains('"text": "Meow"')
    cy.get('[data-test-id="story-controls"] .controls').contains('+1').click().click()
    cy.get('[data-test-id="story-controls"] input[type="text"]').eq(0).clear().type('Waf')
    getIframeBody().find('pre').contains('"count": 2')
    getIframeBody().find('pre').contains('"text": "Waf"')
  })
})

describe('State Setup API (2)', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  beforeEach(() => {
    cy.visit('/story/src-components-statesetup2-story-vue?variantId=src-components-statesetup2-story-vue-0')
  })

  it('syncs state', () => {
    getIframeBody().find('pre').contains('"count": 0')
    getIframeBody().find('pre').contains('"text": "Meow"')
    cy.get('[data-test-id="story-controls"] .controls').contains('+1').click().click()
    cy.get('[data-test-id="story-controls"] input[type="text"]').eq(0).clear().type('Waf')
    getIframeBody().find('pre').contains('"count": 2')
    getIframeBody().find('pre').contains('"text": "Waf"')
  })
})
