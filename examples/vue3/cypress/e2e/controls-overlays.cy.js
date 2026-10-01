/// <reference types="cypress" />

describe('Controls overlays', () => {
  beforeEach(() => {
    cy.viewport(1400, 900)
    cy.visit('/story/src-components-controlsoverlays-story-vue?variantId=src-components-controlsoverlays-story-vue-0')
    cy.getControlsIframeBody().contains('label', 'Option').should('be.visible')
    cy.get('[data-test-id="story-controls-sandbox"]').should(($frame) => {
      expect($frame[0].getBoundingClientRect().height).to.be.greaterThan(0)
    })
  })

  it('renders long dropdowns outside the iframe and syncs keyboard selection', () => {
    cy.getControlsIframeBody().contains('label', 'Option').find('button').click()
    cy.get('[data-test-id="controls-overlay-select"] [role="option"]').first().should('be.visible').then(($option) => {
      const $menu = $option.closest('.v-popper__inner')
      const frame = $menu[0].ownerDocument.querySelector('[data-test-id="story-controls-sandbox"]')
      expect($menu[0].getBoundingClientRect().bottom).to.be.greaterThan(frame.getBoundingClientRect().bottom)
      expect($menu[0].getBoundingClientRect().bottom).to.be.at.most(900)
    })
    cy.focused().should('have.attr', 'role', 'option').type('{downarrow}{enter}')
    cy.getPreviewIframeBody().find('[data-test-id="overlay-state"]').should('contain', '"selected": 1')
    cy.get('[data-test-id="controls-overlay-select"]').should('not.exist')
    cy.getControlsIframeBody().contains('label', 'Option').find('button').should('have.focus')
    cy.getControlsIframeBody().contains('label', 'Option').find('button').click()
    cy.focused().should('have.attr', 'role', 'option').type('{end}')
    cy.focused().should('have.text', 'Option 49').and('be.visible').type('{enter}')
    cy.getPreviewIframeBody().find('[data-test-id="overlay-state"]').should('contain', '"selected": 49')
  })

  it('shrinks controls frame after conditional fields disappear and closes outside clicks', () => {
    cy.get('[data-test-id="story-controls-sandbox"]').then(($frame) => {
      const height = $frame[0].getBoundingClientRect().height
      cy.getControlsIframeBody().contains('label', /^Extra controls$/).click()
      cy.get('[data-test-id="story-controls-sandbox"]').should(($next) => {
        expect($next[0].getBoundingClientRect().height).to.be.lessThan(height)
      })
    })
    cy.getControlsIframeBody().contains('label', 'Option').find('button').click()
    cy.get('[data-test-id="controls-overlay-select"] [role="option"]').first().should('be.visible')
    cy.getControlsIframeBody().contains('label', /^Extra controls$/).click()
    cy.get('[data-test-id="controls-overlay-select"]').should('not.exist')
  })

  it('renders tooltip in the host and removes overlays on story navigation', () => {
    cy.getControlsIframeBody().contains('label', 'Option').find('span').first().trigger('mouseenter')
    cy.get('[data-test-id="controls-overlay-tooltip"]').should('be.visible').and('have.text', 'Option')
    cy.get('[data-test-id="story-list-item"]').contains(/^Controls$/).click()
    cy.get('[data-test-id="controls-overlay-tooltip"]').should('not.exist')
  })

  it('restores focus on Escape and continues Shift+Tab inside the controls form', () => {
    cy.getControlsIframeBody().contains('label', 'Option').find('button').click()
    cy.focused().should('have.attr', 'role', 'option').type('{esc}')
    cy.get('[data-test-id="controls-overlay-select"]').should('not.exist')
    cy.getControlsIframeBody().contains('label', 'Option').find('button').should('have.focus').click()
    cy.focused().should('have.attr', 'role', 'option').trigger('keydown', { key: 'Tab', shiftKey: true })
    cy.get('[data-test-id="controls-overlay-select"]').should('not.exist')
    cy.getControlsIframeBody().find('textarea').should('have.focus')
  })
})
