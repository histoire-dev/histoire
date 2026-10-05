/// <reference types="cypress" />

describe('Event (iframe)', () => {
  it('should send events', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    cy.contains('[aria-label="Inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
    cy.getPreviewIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').contains('My event')
    cy.getPreviewIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').should('have.length', 2)
    cy.getPreviewIframeBody().find('button').contains('Click').click()
    cy.get('[data-test-id="event-item"]').should('have.length', 3)
    cy.get('[data-test-id="event-item"]').contains('Click')
  })

  it('should show event details', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    cy.contains('[aria-label="Inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
    cy.getPreviewIframeBody().find('button').contains('Send').click()
    cy.get('[data-test-id="event-item"]').contains('My event').click()
    cy.get('[data-test-id="event-item"] pre').contains(`{
  "a": "Hello",
  "b": "World"
}`)
  })
})
