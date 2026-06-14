/// <reference types="cypress" />

describe('Controls', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  const getControl = title => cy.get('[data-test-id="story-controls"]')
    .contains('label', title)
    .find('input[type="text"], textarea')

  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
  })

  it('HstText', () => {
    getIframeBody().find('.state-output').contains('"text": "Hello"')
    getControl('HstText').clear().type('Foo')
    getIframeBody().find('.state-output').contains('"text": "Foo"')
  })

  it('HstCheckbox', () => {
    getIframeBody().find('.state-output').contains('"checkbox": false')
    cy.get('[data-test-id="story-controls"]').contains('HstCheckbox').click()
    getIframeBody().find('.state-output').contains('"checkbox": true')
    cy.get('[data-test-id="story-controls"]').contains('HstCheckbox').click()
    getIframeBody().find('.state-output').contains('"checkbox": false')
  })

  it('HstNumber', () => {
    getIframeBody().find('.state-output').contains('"number": 20')
    cy.get('[data-test-id="story-controls"] input[type="number"]').clear().type('42')
    getIframeBody().find('.state-output').contains('"number": 42')
  })

  it('HstTextarea', () => {
    getIframeBody().find('.state-output').contains('"longText": "Longer text..."')
    cy.get('[data-test-id="story-controls"] textarea').clear().type('Meow meow meow')
    getIframeBody().find('.state-output').contains('"longText": "Meow meow meow"')
  })

  it('HstColorSelect', () => {
    getIframeBody().find('.state-output').contains('"colorselect": "#000000"')
    getControl('HstColorSelect').clear().type('#ffffff')
    getIframeBody().find('.state-output').contains('"colorselect": "#ffffff"')
  })
})
