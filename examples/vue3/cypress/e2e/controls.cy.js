/// <reference types="cypress" />

import { visitStories } from '../../../cypress/workbench-actions.js'

// The story defines a `#controls` slot, so the panel renders those custom
// controls (labelled after the component they use) rather than the generic
// state editors.
describe('Controls', () => {
  const getControls = () => cy.getControlsIframeBody()
  const getControl = label => getControls().contains('.histoire-wrapper', new RegExp(`^${label}$`))

  beforeEach(() => {
    visitStories()
    cy.get('[data-test-id="story-list-item"]').contains('Controls').click()
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    getControls().should('be.visible')
  })

  it('updates text state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"text": "Hello"')
    getControl('HstText').find('input').clear().type('Foo')
    cy.getPreviewIframeBody().find('.state-output').contains('"text": "Foo"')
  })

  it('updates checkbox state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"checkbox": false')
    getControl('HstCheckbox').click()
    cy.getPreviewIframeBody().find('.state-output').contains('"checkbox": true')
    getControl('HstCheckbox').click()
    cy.getPreviewIframeBody().find('.state-output').contains('"checkbox": false')
  })

  it('updates numeric state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"number": 20')
    getControl('HstNumber').find('input').clear()
    getControl('HstNumber').find('input').type('42')
    cy.getPreviewIframeBody().find('.state-output').contains('"number": 42')
  })

  it('updates long text state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"longText": "Longer text..."')
    getControl('HstTextarea').find('textarea').clear().type('Meow meow meow')
    cy.getPreviewIframeBody().find('.state-output').contains('"longText": "Meow meow meow"')
  })

  it('updates color state', () => {
    cy.getPreviewIframeBody().find('.state-output').contains('"colorselect": "#000000"')
    getControl('HstColorSelect').find('input[type="text"]').clear().type('#ffffff')
    cy.getPreviewIframeBody().find('.state-output').contains('"colorselect": "#ffffff"')
  })
})
