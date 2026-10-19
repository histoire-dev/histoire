/// <reference types="cypress" />

import { getCanvasVariantBody } from '../../../cypress/workbench-actions.js'

/** Actual viewport used by measured event rows. */
const eventsScroller = '.histoire-events .vue-recycle-scroller'

/** Send through authored button and wait for session's retained-history publication. */
function sendEvents(count, retained) {
  cy.getPreviewIframeBody().contains('button', 'Send').then(($button) => {
    for (let index = 0; index < count; index++) $button[0].click()
  })
  cy.get('.histoire-events-count').should('have.text', `${retained} events · newest first`)
}

/** Real short and wrapped payloads make list overflow with differently measured rows. */
function openOverflowingEvents() {
  cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
  sendEvents(15, 15)
  cy.getPreviewIframeBody().find('input').first().clear().type('Variable height payload '.repeat(12), { delay: 0 })
  sendEvents(15, 30)
  cy.get(eventsScroller).should($viewport => expect($viewport[0].scrollHeight - $viewport[0].clientHeight).to.be.greaterThan(240))
}

describe('Event (iframe)', { defaultCommandTimeout: 20000 }, () => {
  it('follows new events through inclusive 80 px threshold and resumes after manual scrolling', () => {
    openOverflowingEvents()
    let retained = 30
    for (const offset of [0, 79, 80, 81, 240, 79]) {
      cy.get(eventsScroller).scrollTo(0, offset).should('have.prop', 'scrollTop', offset)
      sendEvents(1, ++retained)
      if (offset <= 80) {
        cy.get(eventsScroller).should('have.prop', 'scrollTop', 0)
        cy.get('.histoire-event-row').first().should('be.visible').find('pre').should('contain.text', 'Variable height payload')
      }
      else {
        cy.get(eventsScroller).should($viewport => expect($viewport[0].scrollTop).to.be.greaterThan(80))
      }
    }
    cy.get(eventsScroller).scrollTo(0, 80)
    sendEvents(5, retained + 5)
    cy.get(eventsScroller).should('have.prop', 'scrollTop', 0)
  })

  it('honors manual scrolling between publication and deferred follow', () => {
    openOverflowingEvents()
    cy.get(eventsScroller).scrollTo(0, 79)
    cy.get('.histoire-events-count').then(($count) => {
      const element = $count[0]
      const observer = new element.ownerDocument.defaultView.MutationObserver(() => {
        // Vue patched event count, but its nextTick continuation has not run yet.
        element.closest('.histoire-events').querySelector('.vue-recycle-scroller').scrollTop = 240
        observer.disconnect()
      })
      observer.observe(element, { childList: true, characterData: true, subtree: true })
    })
    sendEvents(1, 31)
    cy.get(eventsScroller).should($viewport => expect($viewport[0].scrollTop).to.be.greaterThan(80))
    cy.get(eventsScroller).scrollTo(0, 79)
    sendEvents(1, 32)
    cy.get(eventsScroller).should('have.prop', 'scrollTop', 0)
  })

  it('keeps following when bounded history replaces oldest event', () => {
    openOverflowingEvents()
    for (let retained = 80; retained <= 980; retained += 50) sendEvents(50, retained)
    sendEvents(20, 1000)
    cy.get(eventsScroller).scrollTo(0, 79)
    cy.getPreviewIframeBody().contains('button', 'Click').click()
    cy.get('.histoire-events-count').should('have.text', '1000 events · newest first')
    cy.get('.histoire-events output').should('have.text', '1 dropped')
    cy.get(eventsScroller).should('have.prop', 'scrollTop', 0)
    cy.get('.histoire-event-row').first().should('be.visible').should('contain.text', 'Click')
  })

  it('should send events', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default&tab=events')
    cy.contains('[aria-label="Story inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
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
    cy.contains('[aria-label="Story inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
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
    cy.contains('[aria-label="Story inspector"] [role="tab"]', 'Events').should('have.attr', 'aria-selected', 'true')
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
