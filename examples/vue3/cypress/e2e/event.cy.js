/// <reference types="cypress" />

import { getCanvasVariantBody } from '../../../cypress/workbench-actions.js'

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

  it('selects a variant on iframe click while preserving its component action', () => {
    const storyId = 'src-components-eventbuttongrid-story-vue'
    const variantId = `${storyId}-1`
    const frameKey = JSON.stringify([storyId, variantId])
    const frameSelector = `[data-frame-id='${frameKey}'] iframe[title="Histoire variant"]`
    let previewFrame

    cy.visit(`/story/${storyId}?variantId=${storyId}-0&tab=events`)
    cy.contains('[aria-label="Inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
    cy.get(frameSelector, { timeout: 20000 }).should('be.visible').then(($frame) => {
      previewFrame = $frame[0]
    })

    getCanvasVariantBody(storyId, variantId).find('button').contains('Click').click()

    cy.location('search').should('include', `variantId=${variantId}`)
    cy.get(`[data-frame-id='${frameKey}'] > button[aria-pressed="true"]`).should('be.visible')
    cy.get(frameSelector).should(($frame) => {
      expect($frame[0]).to.equal(previewFrame)
    })
    cy.get('[data-test-id="event-item"]').should('have.length', 1).contains('Click')
  })
})
