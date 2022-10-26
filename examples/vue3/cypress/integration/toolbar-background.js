/// <reference types="cypress" />

describe('background color', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  const backgroundColorShouldBe = [
    'rgba(0, 0, 0, 0)',
    'rgb(255, 255, 255)',
    'rgb(170, 170, 170)',
    'rgb(51, 51, 51)',
    'rgb(0, 0, 0)',
    'rgb(202, 255, 245)',
  ]

  const contrastColorShouldBe = [
    'rgb(51, 51, 51)',
    'rgb(51, 51, 51)',
    'rgb(0, 0, 0)',
    'rgb(255, 255, 255)',
    'rgb(238, 238, 238)',
    'rgb(0, 81, 66)',
  ]

  it('should provide background and contrast color (no iframe)', () => {
    cy.visit('/story/src-components-complexparameter-story-vue?variantId=_default')
    cy.get('[data-test-id="toolbar-background"]').click()
    cy.get('[data-test-id="background-popper"]').should('be.visible').find('button').should('have.length', 6).each(($el, index) => {
      cy.wrap($el).click()
      cy.get('[data-test-id="responsive-preview-bg"]').should('have.css', 'background-color', backgroundColorShouldBe[index])
      cy.get('[data-test-id="story-variant-single-view"] .native-story').should('have.css', 'color', contrastColorShouldBe[index])
      cy.get('[data-test-id="toolbar-background"]').click()
    })
  })

  it('should provide background and contrast color (with iframe)', () => {
    cy.visit('story/src-components-contrastcolor-story-vue?variantId=_default')
    cy.get('[data-test-id="toolbar-background"]').click()
    cy.get('[data-test-id="background-popper"]').should('be.visible').find('button').should('have.length', 6).each(($el, index) => {
      cy.wrap($el).click()
      getIframeBody().find('.contrast-color').should('have.css', 'color', contrastColorShouldBe[index])
      cy.get('[data-test-id="toolbar-background"]').click()
    })
  })

  it('should provide background and contrast color (grid)', () => {
    cy.visit('/story/src-components-substory-story-vue?variantId=src-components-substory-story-vue-0')
    cy.get('[data-test-id="toolbar-background"]').click()
    cy.get('[data-test-id="background-popper"]').should('be.visible').find('button').should('have.length', 6).each(($el, index) => {
      cy.wrap($el).click()
      cy.get('[data-test-id="responsive-preview-bg"]').should('have.css', 'background-color', backgroundColorShouldBe[index])
      cy.get('.__histoire-sandbox .text').should('have.css', 'color', contrastColorShouldBe[index])
      cy.get('[data-test-id="toolbar-background"]').click()
    })
  })
})
