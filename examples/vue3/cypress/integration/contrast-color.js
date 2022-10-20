/// <reference types="cypress" />

describe('contrast color', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  const colorShouldBe = [
    'rgb(51, 51, 51)',
    'rgb(51, 51, 51)',
    'rgb(238, 238, 238)',
    'rgb(204, 204, 204)',
    'rgb(255, 255, 255)',
    'rgb(255, 255, 255)',
  ]

  it('should provide contrast color (no iframe)', () => {
    cy.visit('/story/src-components-complexparameter-story-vue?variantId=_default')
    cy.get('[data-test-id="toolbar-background"]').click()
    cy.get('[data-test-id="background-popper"]').should('be.visible').find('button').should('have.length', 6).each(($el, index) => {
      cy.wrap($el).click()
      cy.get('[data-test-id="story-variant-single-view"] .native-story').should('have.css', 'color', colorShouldBe[index])
      cy.get('[data-test-id="toolbar-background"]').click()
    })
  })

  it('should provide contrast color(with iframe)', () => {
    cy.visit('story/src-components-contrastcolor-story-vue?variantId=_default')
    cy.get('[data-test-id="toolbar-background"]').click()
    cy.get('[data-test-id="background-popper"]').should('be.visible').find('button').should('have.length', 6).each(($el, index) => {
      cy.wrap($el).click()
      getIframeBody().find('.contrast-color').should('have.css', 'color', colorShouldBe[index])
      cy.get('[data-test-id="toolbar-background"]').click()
    })
  })
})
