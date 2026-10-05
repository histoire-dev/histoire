/// <reference types="cypress" />

/** Accessible shell navigation shared by every framework example. */
const rail = '[aria-label="Workbench"]'
/** Canonical inspector content, excluding its floating outer container. */
const inspector = '[data-test-id="story-side-panel"]'
/** Canvas region owns pointer gestures and keyboard tool shortcuts. */
const canvas = '[aria-label="Story canvas"]'
/** Primary readiness wrapper excludes passive canvas replica documents. */
export const primaryPreviewFrame = '[aria-busy="false"] iframe[title="Histoire preview"]'

/**
 * Exercises framework-independent workbench contracts against real previews.
 * @param {{ path: string, previewText: string }} example Existing story fixture.
 */
export function describeWorkbenchContract(example) {
  if (Cypress.env('workbenchMode') !== 'dev') {
    let externalRequests
    beforeEach(() => {
      externalRequests = []
      // Include nested controls documents; offline builds must supply every builtin asset.
      cy.intercept({ url: /^https?:\/\/(?:api\.iconify\.design|fonts\.googleapis\.com|fonts\.gstatic\.com)\// }, (request) => {
        externalRequests.push(request.url)
        request.destroy()
      })
    })
    afterEach(() => {
      expect(externalRequests, 'external icon and font requests').to.deep.equal([])
    })
  }

  describe('Workbench contracts', () => {
    beforeEach(() => {
      cy.viewport(1600, 1000)
    })

    it('persists selected pane, panel visibility, and inspector visibility', () => {
      cy.visit(example.path)
      cy.getPreviewIframeBody().contains(example.previewText)
      cy.get(`${rail} [aria-label="Search"]`).click()
      cy.get('[aria-label="Search stories, docs and props"]').should('be.visible')
      cy.get(`${rail} [aria-label="Collapse side panel"]`).click()
      cy.get('[aria-label="Close inspector"]').click()
      cy.reload()
      cy.get(inspector).should('not.exist')
      cy.get('[aria-label="Show inspector"]').should('be.visible').click()
      cy.get(inspector).should('be.visible')
      cy.get(`${rail} [aria-label="Expand side panel"]`).should('have.attr', 'aria-expanded', 'false').click()
      cy.get('[aria-label="Search stories, docs and props"]').should('be.visible')
      cy.get(`${rail} [aria-label="Stories"]`).click()
      cy.get('[aria-label="stories panel"]').should('be.visible')
      cy.location('pathname').should('equal', example.path.split('?')[0])
    })

    it('recovers canonical preview after its document reloads', () => {
      cy.visit(example.path)
      cy.getPreviewIframeBody().contains(example.previewText)
      cy.get(primaryPreviewFrame).then(($frame) => {
        const frame = $frame[0]
        const previous = frame.contentDocument
        // Wait actual native load, so an already-ready predecessor cannot satisfy recovery.
        return new Cypress.Promise((resolve) => {
          frame.addEventListener('load', () => {
            expect(frame.contentDocument).not.to.equal(previous)
            resolve()
          }, { once: true })
          frame.contentWindow.location.reload()
        })
      })
      cy.getPreviewIframeBody({ timeout: 20000 }).contains(example.previewText)
      cy.location('search').should('equal', `?${example.path.split('?')[1]}`)
    })

    it('shares persistent color scheme between settings and rail action', () => {
      cy.visit('/settings/appearance')
      cy.contains('[aria-label="Color scheme"] button', /^Dark$/).click().should('have.attr', 'aria-pressed', 'true')
      cy.reload()
      cy.contains('[aria-label="Color scheme"] button', /^Dark$/).should('have.attr', 'aria-pressed', 'true')
      cy.get(`${rail} [aria-label="Toggle dark mode"]`).click()
      cy.contains('[aria-label="Color scheme"] button', /^Light$/).should('have.attr', 'aria-pressed', 'true')
      cy.reload()
      cy.contains('[aria-label="Color scheme"] button', /^Light$/).should('have.attr', 'aria-pressed', 'true')
    })

    it('pans frames with Space and uses keyboard zoom without changing selection', () => {
      cy.visit(example.path)
      cy.getPreviewIframeBody().contains(example.previewText)
      cy.get(canvas).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: ')', code: 'Digit0', shiftKey: true })
      cy.get('[aria-label="Zoom level"]').should('contain', '100%')
      cy.get(canvas).trigger('keydown', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space' })
      cy.contains('[aria-live="polite"]', 'Panning').should('be.visible')
      cy.get(primaryPreviewFrame).then(($frame) => {
        const original = $frame[0].getBoundingClientRect()
        // Client-space movement must remain identical at every canvas zoom.
        cy.get(canvas)
          .trigger('pointerdown', { eventConstructor: 'PointerEvent', pointerId: 7, button: 0, clientX: 700, clientY: 500, force: true })
          .trigger('pointermove', { eventConstructor: 'PointerEvent', pointerId: 7, clientX: 760, clientY: 540, force: true })
          .trigger('pointerup', { eventConstructor: 'PointerEvent', pointerId: 7, button: 0, clientX: 760, clientY: 540, force: true })
        cy.get(primaryPreviewFrame).should(($moved) => {
          const moved = $moved[0].getBoundingClientRect()
          expect(moved.x - original.x).to.be.closeTo(60, 1)
          expect(moved.y - original.y).to.be.closeTo(40, 1)
        })
      })
      cy.get(canvas).trigger('keyup', { eventConstructor: 'KeyboardEvent', key: ' ', code: 'Space' })
      cy.contains('[aria-live="polite"]', 'Panning').should('not.exist')
      cy.get('[aria-label="Pan"]').click().should('have.attr', 'aria-pressed', 'true')
      cy.get('[aria-label="Select"]').click().should('have.attr', 'aria-pressed', 'true')
      cy.get(canvas).trigger('keydown', { eventConstructor: 'KeyboardEvent', key: '!', code: 'Digit1', shiftKey: true })
      cy.get('[aria-label="Zoom level"]').should('contain', 'Fit').click()
      cy.get('[role="dialog"][aria-label="Zoom level"]').should('be.visible')
      cy.get('[role="dialog"][aria-label="Zoom level"]').trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
      cy.get('[role="dialog"][aria-label="Zoom level"]').should('not.exist')
      cy.get('[aria-label="Zoom level"]').should('be.focused')
      cy.location('search').should('equal', `?${example.path.split('?')[1]}`)
    })

    it('persists local viewport presets and applies their logical frame size', () => {
      cy.visit('/settings/viewports')
      cy.contains('button', /^\s*\+ Add preset\s*$/).click()
      cy.get('[aria-label="Preset name"]').type('Acceptance viewport')
      cy.get('[aria-label="Viewport width"]').clear().type('333')
      cy.get('[aria-label="Viewport height"]').clear().type('222')
      cy.contains('form button', /^\s*Save\s*$/).click()
      cy.reload()
      cy.get('[aria-label="Edit Acceptance viewport"]').should('be.visible')
      cy.visit(example.path)
      cy.get('[aria-label="Viewport"][aria-haspopup="dialog"]').click()
      cy.contains('[role="dialog"][aria-label="Viewport"] button', 'Acceptance viewport').click()
      cy.get(primaryPreviewFrame).should(($frame) => {
        expect($frame[0].contentWindow.innerWidth).to.equal(333)
        expect($frame[0].contentWindow.innerHeight).to.equal(222)
      })
      cy.get('[role="dialog"][aria-label="Viewport"]').should('not.exist')
      cy.visit('/settings/viewports')
      cy.get('[aria-label^="Remove "]').first().invoke('attr', 'aria-label').then((label) => {
        const name = label.slice('Remove '.length)
        cy.get(`[aria-label="Remove ${name}"]`).click()
        cy.get(`[aria-label="Edit ${name}"]`).should('not.exist')
        cy.contains('button', /^\s*Reset to project\s*$/).click()
        cy.get(`[aria-label="Edit ${name}"]`).should('be.visible')
        cy.get('[aria-label="Edit Acceptance viewport"]').should('not.exist')
      })
    })

    it('exposes only panes and settings supported by current build mode', () => {
      cy.visit('/')
      const dev = Cypress.env('workbenchMode') === 'dev'
      for (const label of ['Tests', 'Comments', 'MCP activity']) {
        cy.get(`${rail} [aria-label^="${label}"]`).should(dev ? 'exist' : 'not.exist')
      }
      cy.get(`${rail} [aria-label="Settings"]`).click()
      for (const label of ['Tests', 'AI agents (ACP)', 'MCP server']) {
        if (dev) cy.contains('[aria-label="Settings sections"] button', label).should('be.visible')
        else cy.get('[aria-label="Settings sections"]').should('not.contain', label)
      }
      if (!dev) {
        cy.visit('/settings/agents')
        cy.location('pathname').should('equal', '/settings/appearance')
        cy.contains('h1', 'Appearance').should('be.visible')
      }
    })
  })
}
