/// <reference types="cypress" />

describe('Controls', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  const getControls = () => cy.get('[data-test-id="story-controls"]')
  const getControl = label => getControls().contains('label', new RegExp(`^${label}$`))

  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.get('[data-test-id="story-side-panel"]').contains('Loading...').should('not.exist')
  })

  it('updates text state', () => {
    getIframeBody().find('.state-output').contains('"text": "Hello"')
    getControl('text').find('input').clear().type('Foo')
    getIframeBody().find('.state-output').contains('"text": "Foo"')
  })

  it('updates checkbox state', () => {
    getIframeBody().find('.state-output').contains('"checkbox": false')
    getControl('checkbox').click()
    getIframeBody().find('.state-output').contains('"checkbox": true')
    getControl('checkbox').click()
    getIframeBody().find('.state-output').contains('"checkbox": false')
  })

  it('updates numeric state', () => {
    getIframeBody().find('.state-output').contains('"number": 20')
    getControl('number').find('input').clear()
    getControl('number').find('input').type('42')
    getIframeBody().find('.state-output').contains('"number": "42"')
  })

  it('updates long text state', () => {
    getIframeBody().find('.state-output').contains('"longText": "Longer text..."')
    getControl('longText').find('input').clear().type('Meow meow meow')
    getIframeBody().find('.state-output').contains('"longText": "Meow meow meow"')
  })

  it('updates color state', () => {
    getIframeBody().find('.state-output').contains('"colorselect": "#000000"')
    getControl('colorselect').find('input').clear().type('#ffffff')
    getIframeBody().find('.state-output').contains('"colorselect": "#ffffff"')
  })
})
