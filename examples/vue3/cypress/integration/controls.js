/// <reference types="cypress" />

describe('Controls', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
  })

  it('HstText', () => {
    getIframeBody().get('pre').contains('"text": "Hello"')
    cy.get('[data-test-id="story-controls"]').get('input[type="text"]').clear().type('Foo')
    getIframeBody().get('pre').contains('"text": "Foo"')
  })

  it('HstCheckbox', () => {
    getIframeBody().get('pre').contains('"checkbox": false')
    cy.get('[data-test-id="story-controls"]').contains('HstCheckbox').click()
    getIframeBody().get('pre').contains('"checkbox": true')
    cy.get('[data-test-id="story-controls"]').contains('HstCheckbox').click()
    getIframeBody().get('pre').contains('"checkbox": false')
  })

  it('HstNumber', () => {
    getIframeBody().get('pre').contains('"number": 20')
    cy.get('[data-test-id="story-controls"]').get('input[type="number"]').clear().type('42')
    getIframeBody().get('pre').contains('"number": 42')
  })

  it('HstTextarea', () => {
    getIframeBody().get('pre').contains('"longText": "Longer text..."')
    cy.get('[data-test-id="story-controls"]').get('textarea').clear().type('Meow meow meow')
    getIframeBody().get('pre').contains('"longText": "Meow meow meow"')
  })
})
