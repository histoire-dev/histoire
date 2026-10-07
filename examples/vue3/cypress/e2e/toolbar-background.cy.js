/// <reference types="cypress" />

describe('background color', () => {
  beforeEach(() => cy.viewport(1600, 1000))
  const backgroundLabels = ['Transparent', 'White', 'Light gray', 'Dark gray', 'Black', 'Custom gray']

  const backgroundColorShouldBe = [
    'rgba(0, 0, 0, 0)',
    'rgb(255, 255, 255)',
    'rgb(170, 170, 170)',
    'rgb(51, 51, 51)',
    'rgb(0, 0, 0)',
    'rgb(202, 255, 245)',
  ]

  const contrastColorShouldBe = [
    'rgb(51, 51, 51)',
    'rgb(51, 51, 51)',
    'rgb(0, 0, 0)',
    'rgb(255, 255, 255)',
    'rgb(238, 238, 238)',
    'rgb(0, 81, 66)',
  ]

  /**
   * Applies nth configured preset through frame background popover.
   * Re-query each time because runtime readiness re-renders toolbar.
   */
  function selectBackground(index) {
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.get(`[data-test-id="background-popper"] button[aria-label="${backgroundLabels[index]}"]`).click()
    cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
  }

  /** Runs `assert(index)` once per background preset. */
  function forEachBackground(assert) {
    for (let index = 0; index < backgroundColorShouldBe.length; index++) {
      selectBackground(index)
      assert(index)
    }
  }

  /**
   * Opens a story and waits for the preview to report ready: the toolbar
   * re-renders at that point, and interacting with it before detaches the
   * element mid-command.
   */
  function openStory(url) {
    cy.visit(url)
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody()
  }

  it('should provide background and contrast color (single variant)', () => {
    openStory('/story/src-components-contrastcolor-story-vue?variantId=_default')
    forEachBackground((index) => {
      cy.getPreviewIframeBody().find('.contrast-color').should('have.css', 'color', contrastColorShouldBe[index])
    })
  })

  it('retains dark checkerboard across reload and exposes both palettes in every arrangement', () => {
    openStory('/story/src-components-workbenchmatrix-story-vue?variantId=default')
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.get('[aria-label="Dark checkerboard"]').click().should('have.attr', 'aria-pressed', 'true')
    cy.get('[aria-label="Transparent"]').should('have.attr', 'aria-pressed', 'false')
    cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
    cy.reload()
    cy.getPreviewIframeBody().contains('Matrix message')
    for (const arrangement of ['Single variant', 'Grid', 'List', 'Props matrix']) {
      cy.get(`[aria-label="${arrangement}"]`).should('not.be.disabled').click()
      cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
        expect($frames).to.have.length.greaterThan(0)
        for (const frame of $frames) {
          expect(frame.closest('[aria-busy]')).to.have.attr('aria-busy', 'false')
          expect(frame.contentDocument.body.textContent).to.match(/Matrix message|Alternate preset/)
        }
      })
      cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
      cy.get('[aria-label="Dark checkerboard"]').should('have.attr', 'aria-pressed', 'true')
      cy.get('[aria-label="Light checkerboard"]').focus().type('{enter}').should('have.attr', 'aria-pressed', 'true')
      cy.screenshot(`checkerboard-${arrangement.replaceAll(' ', '-').toLowerCase()}-light`)
      cy.get('[aria-label="Dark checkerboard"]').click().should('have.attr', 'aria-pressed', 'true')
      cy.screenshot(`checkerboard-${arrangement.replaceAll(' ', '-').toLowerCase()}-dark`)
      cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
    }
    cy.get('[aria-label="Toggle dark mode"]').click()
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.get('[aria-label="Dark checkerboard"]').should('have.attr', 'aria-pressed', 'true')
    cy.screenshot('checkerboard-dark-appearance')
    cy.get('[aria-label="White"]').click().should('have.attr', 'aria-pressed', 'true')
    cy.get('[aria-label="Dark checkerboard"]').should('have.attr', 'aria-pressed', 'false')
  })

  it('keeps selected-only checkerboard separate from shared background', () => {
    openStory('/story/src-components-workbenchmatrix-story-vue?variantId=default')
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.get('[aria-label="Dark checkerboard"]').click()
    cy.contains('[aria-label="Apply background to"] button', 'Selected').click()
    cy.get('[aria-label="Light checkerboard"]').click().should('have.attr', 'aria-pressed', 'true')
    cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
    cy.contains('[data-frame-id] > button', 'Alternate').click()
    cy.getPreviewIframeBody().contains('Alternate preset')
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.get('[aria-label="Dark checkerboard"]').should('have.attr', 'aria-pressed', 'true')
    cy.contains('[aria-label="Apply background to"] button', 'All frames').click()
    cy.get('[aria-label="White"]').click()
    cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
    cy.contains('[data-frame-id] > button', 'Default').click()
    cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
    cy.contains('[aria-label="Apply background to"] button', 'Selected').click()
    cy.get('[aria-label="White"]').should('have.attr', 'aria-pressed', 'true')
    cy.get('[aria-label="Light checkerboard"]').should('have.attr', 'aria-pressed', 'false')
  })

  it('changes inspection backing on generated Tailwind typography', () => {
    cy.visit('/story/tailwind?variantId=font-family&arrange=grid')
    // Token books boot several documents; wait for selected owner before shared iframe helper.
    cy.get('.histoire-canvas-frame.is-selected .histoire-canvas-replica', { timeout: 30000 }).should('have.attr', 'aria-busy', 'false')
    cy.getPreviewIframeBody().contains('htw-font-sans')
    cy.get('[aria-label="Zoom level"]').click()
    cy.contains('button', 'Zoom to selection').click()
    for (const label of ['Dark checkerboard', 'Light checkerboard', 'Transparent']) {
      cy.get('[aria-label="Background"][aria-haspopup="dialog"]').click()
      cy.get(`button[aria-label="${label}"]`).click().should('have.attr', 'aria-pressed', 'true')
      cy.get('[role="dialog"][aria-label="Background"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
      cy.screenshot(`tailwind-${label.toLowerCase().replaceAll(' ', '-')}`)
    }
  })

  // Canonical preview owns runtime contrast; frame chrome owns canvas background.
  it('should provide background and contrast color (grid)', () => {
    openStory('/story/src-components-substory-story-vue?variantId=src-components-substory-story-vue-0')
    forEachBackground((index) => {
      cy.get('[data-frame-id] > button[aria-pressed="true"]').parent().find('[data-test-id="responsive-preview-bg"]').should('have.css', 'background-color', backgroundColorShouldBe[index])
      cy.getPreviewIframeBody().find('.histoire-generic-render-story .text').should('have.css', 'color', contrastColorShouldBe[index])
    })
  })
})
