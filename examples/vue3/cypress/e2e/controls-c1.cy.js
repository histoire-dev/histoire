/// <reference types="cypress" />

import { beginCommentDraft } from '../../../cypress/workbench-actions.js'

/** Captures C1 acceptance states while exercising real native and sandbox controls. */
describe('C1 shared controls acceptance', () => {
  beforeEach(() => cy.clearLocalStorage())
  for (const appearance of ['Light', 'Dark']) {
    for (const density of ['Comfortable', 'Compact']) {
      if (Cypress.env('controlsNarrow')) continue
      // Isolated state runs reuse same proof when concurrent package builds disrupt a campaign.
      if (Cypress.env('controlsAppearance') && Cypress.env('controlsAppearance') !== appearance) continue
      if (Cypress.env('controlsDensity') && Cypress.env('controlsDensity') !== density) continue
      it(`${appearance} ${density} reaches native and sandbox controls`, () => {
        const name = `c1-${appearance.toLowerCase()}-${density.toLowerCase()}`
        cy.viewport(1600, 1000)
        cy.visit('/settings/appearance')
        cy.contains('[aria-label="Color scheme"] button', new RegExp(`^${appearance}$`)).click()
        cy.contains('[aria-label="Density"] button', new RegExp(`^${density}$`)).click()
        cy.get('.histoire-settings-content').scrollTo('top', { ensureScrollable: false })
        cy.screenshot(`${name}-settings`)
        cy.visit('/settings/agents')
        cy.get('[role="switch"][aria-label="Enable local agents"]').should('match', 'input')
        cy.get('[aria-label="File edit policy"] button').should('have.length', 3)
        cy.screenshot(`${name}-agent-settings`)
        cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId=default')
        cy.getPreviewIframeBody({ timeout: 20000 }).contains('Matrix message')
        cy.get('[aria-label="Controls"] [role="switch"]').should('exist')
        cy.screenshot(`${name}-native`)
        cy.get('[aria-label="Props matrix"]').click()
        cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
        cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
          expect($frames).to.have.length(4)
          for (const frame of $frames) expect(frame.contentDocument?.body.textContent).to.contain('Matrix message')
        })
        cy.screenshot(`${name}-matrix`)
        cy.visit('/story/src-components-controlsoverlays-story-vue?variantId=src-components-controlsoverlays-story-vue-0')
        cy.getControlsIframeBody({ timeout: 20000 }).find('button[aria-label="Option"]').should('be.visible')
        cy.getControlsIframeBody().find('.histoire-wrapper').first().should('have.attr', 'data-histoire-control-appearance', appearance.toLowerCase())
        cy.get('[aria-label="Controls"] button[aria-label="State preset"]').then(($owner) => {
          const owner = $owner[0].ownerDocument.defaultView.getComputedStyle($owner[0])
          const input = owner.backgroundColor
          const height = owner.getPropertyValue('--histoire-control-height').trim()
          cy.getControlsIframeBody().find('input[type="text"]').should(($field) => {
            const projected = $field[0].ownerDocument.defaultView.getComputedStyle($field[0])
            expect(projected.backgroundColor).to.equal(input)
            expect(projected.getPropertyValue('--histoire-control-height').trim()).to.equal(height)
          })
        })
        cy.getControlsIframeBody().find('button[aria-label="Option"]').click()
        cy.focused().should('have.attr', 'role', 'option').type('{end}')
        cy.focused().should('have.text', 'Option 49').and('be.visible')
        cy.get('[role="option"]').contains('Option 5').should('be.disabled')
        cy.get('[role="listbox"]').should($menu => expect($menu[0].getBoundingClientRect().height).to.be.at.most(361))
        cy.screenshot(`${name}-iframe-menu`)
        cy.focused().type('{esc}')
        cy.get('button[aria-label="Viewport"]').click()
        cy.get('[aria-label="Custom width"]').should('be.visible')
        cy.screenshot(`${name}-toolbar`)
        cy.get('button[aria-label="Viewport"]').click()
        beginCommentDraft()
        cy.screenshot(`${name}-comments`)
      })
    }
  }

  if (!Cypress.env('controlsAppearance') && !Cypress.env('controlsDensity')) {
    it('keeps narrow inspector and long menu usable', () => {
      cy.viewport(820, 900)
      cy.visit('/story/src-components-controlsoverlays-story-vue?variantId=src-components-controlsoverlays-story-vue-0')
      cy.get('[aria-label="Collapse side panel"]').click()
      cy.getControlsIframeBody({ timeout: 20000 }).find('button[aria-label="Option"]').click()
      cy.focused().type('{end}')
      cy.focused().should('have.text', 'Option 49').and('be.visible')
      cy.get('[role="listbox"]').should($menu => expect($menu[0].getBoundingClientRect().height).to.be.at.most(361))
      cy.screenshot('c1-narrow-iframe-menu')
      cy.focused().type('{esc}')
      cy.getControlsIframeBody().find('button[aria-label="Option"]').should('have.focus')
    })
  }
})
