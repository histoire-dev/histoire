/// <reference types="cypress" />

describe('Event (iframe)', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  it('should send events', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    getIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').contains('My event')
    getIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').should('have.length', 2)
    getIframeBody().find('button').contains('Click').click()
    cy.get('[data-test-id="event-item"]').should('have.length', 3)
    cy.get('[data-test-id="event-item"]').contains('Click')
  })

  it('should show event details', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    getIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').contains('My event').click()
    cy.get('.v-popper__popper').contains(`{
  "a": "Hello",
  "b": "World"
}`)
  })
})
