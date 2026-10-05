/// <reference types="cypress" />

describe('Controls overlays', () => {
  beforeEach(() => {
    cy.viewport(1400, 900)
    cy.visit('/story/src-components-controlsoverlays-story-vue?variantId=src-components-controlsoverlays-story-vue-0')
    cy.getPreviewIframeBody({ timeout: 20000 }).find('[data-test-id="overlay-state"]')
    cy.getControlsIframeBody({ timeout: 20000 }).contains('label', 'Option').should('be.visible')
    cy.get('iframe[title="Histoire custom controls"]').should(($frame) => {
      // Wait adaptive intrinsic height, rather than initial 32px boot frame.
      expect($frame[0].getBoundingClientRect().height).to.be.at.least($frame[0].contentDocument.body.scrollHeight)
    })
  })

  it('renders long dropdowns outside the iframe and syncs keyboard selection', () => {
    cy.getControlsIframeBody().find('button[aria-label="Option"]').click()
    cy.get('[role="listbox"] [role="option"]').first().should('be.visible').then(($option) => {
      const $menu = $option.closest('.v-popper__inner')
      const frame = $menu[0].ownerDocument.querySelector('iframe[title="Histoire custom controls"]')
      expect($menu[0].getBoundingClientRect().bottom).to.be.greaterThan(frame.getBoundingClientRect().bottom)
      expect($menu[0].getBoundingClientRect().bottom).to.be.at.most(900)
    })
    cy.focused().should('have.attr', 'role', 'option').type('{downarrow}{enter}')
    cy.getPreviewIframeBody().find('[data-test-id="overlay-state"]').should('contain', '"selected": 1')
    cy.get('[role="listbox"]').should('not.exist')
    cy.getControlsIframeBody().find('button[aria-label="Option"]').should('have.focus')
    cy.getControlsIframeBody().find('button[aria-label="Option"]').click()
    cy.focused().should('have.attr', 'role', 'option').type('{end}')
    cy.focused().should('have.text', 'Option 49').and('be.visible').type('{enter}')
    cy.getPreviewIframeBody().find('[data-test-id="overlay-state"]').should('contain', '"selected": 49')
  })

  it('shrinks controls frame after conditional fields disappear and closes outside clicks', () => {
    cy.get('iframe[title="Histoire custom controls"]').then(($frame) => {
      const height = $frame[0].getBoundingClientRect().height
      cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Extra controls"]').click()
      cy.get('iframe[title="Histoire custom controls"]').should(($next) => {
        expect($next[0].getBoundingClientRect().height).to.be.lessThan(height)
      })
    })
    cy.getControlsIframeBody().find('button[aria-label="Option"]').click()
    cy.get('[role="listbox"] [role="option"]').first().should('be.visible')
    cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Extra controls"]').click()
    cy.get('[role="listbox"]').should('not.exist')
  })

  it('renders tooltip in the host and removes overlays on story navigation', () => {
    cy.getPreviewIframeBody({ timeout: 20000 }).find('[data-test-id="overlay-state"]')
    cy.getControlsIframeBody({ timeout: 20000 }).contains('label', 'Option').trigger('mouseenter')
    cy.get('[role="tooltip"]').should('be.visible').and('have.text', 'Option')
    cy.get('[data-test-id="story-list-item"][aria-label="Controls"]').click()
    cy.get('[role="tooltip"]').should('not.exist')
  })

  it('restores focus on Escape and continues Shift+Tab inside the controls form', () => {
    cy.getControlsIframeBody().find('button[aria-label="Option"]').click()
    cy.focused().should('have.attr', 'role', 'option').type('{esc}')
    cy.get('[role="listbox"]').should('not.exist')
    cy.getControlsIframeBody().find('button[aria-label="Option"]').should('have.focus').click()
    cy.focused().should('have.attr', 'role', 'option').trigger('keydown', { key: 'Tab', shiftKey: true })
    cy.get('[role="listbox"]').should('not.exist')
    cy.getControlsIframeBody().find('textarea').should('have.focus')
  })
})
