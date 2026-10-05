/// <reference types="cypress" />

describe('background color', () => {
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
    cy.get('[data-test-id="background-popper"] button[title]').should('have.length', 7).eq(index).click()
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

  // Canonical preview owns runtime contrast; frame chrome owns canvas background.
  it('should provide background and contrast color (grid)', () => {
    openStory('/story/src-components-substory-story-vue?variantId=src-components-substory-story-vue-0')
    forEachBackground((index) => {
      cy.get('[data-frame-id] > button[aria-pressed="true"]').parent().find('[data-test-id="responsive-preview-bg"]').should('have.css', 'background-color', index === 0 ? 'rgb(255, 255, 255)' : backgroundColorShouldBe[index])
      cy.getPreviewIframeBody().find('.histoire-generic-render-story .text').should('have.css', 'color', contrastColorShouldBe[index])
    })
  })
})
