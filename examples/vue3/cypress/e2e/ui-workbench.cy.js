import { beginCommentDraft, selectControl } from '../../../cypress/workbench-actions.js'
/// <reference types="cypress" />

import { describeWorkbenchContract } from '../../../cypress/workbench-contract.js'

describeWorkbenchContract({
  path: '/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0',
  previewText: 'Hello world!',
})

if (Cypress.env('workbenchMode') === 'dev') {
  describe('Vue development workbench', () => {
    beforeEach(() => {
      cy.viewport(1600, 1000)
      cy.visit('/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0')
      cy.getPreviewIframeBody().contains('Hello world!')
    })

    it('persists a comment draft, resolves it, and reopens its exact thread', () => {
      const message = `Acceptance draft ${Date.now()}`
      beginCommentDraft()
      cy.get('[aria-label="Comment message"]').should('be.focused').type(message)
      cy.contains('[aria-label="Comment for AI"] button', /^\s*Save draft\s*$/).click()
      cy.contains('[aria-label="Comment conversation"]', message).should('be.visible')
      cy.get('[aria-label="Workbench"] [aria-label^="Comments"]').click()
      cy.contains('[aria-label="Comments"] button', message).should('contain', 'Not sent yet')
      cy.reload()
      cy.contains('[aria-label="Comments"] button', message).click()
      cy.contains('[aria-label="Comment conversation"] button', /^\s*Resolve\s*$/).click()
      cy.contains('[aria-label="Comment status"] button', /^Resolved/).click()
      cy.contains('[aria-label="Comments"] button', message).should('contain', 'Resolved').click()
      cy.contains('[aria-label="Comment conversation"] button', /^\s*Reopen\s*$/).click()
      cy.contains('[aria-label="Comment status"] button', /^Open/).click()
      cy.contains('[aria-label="Comments"] button', message).should('contain', 'Not sent yet').click()
      cy.get('[aria-label="Comment conversation"] [aria-label="Delete comment"]').click()
      cy.get('[aria-label="Comments"]').should('not.contain', message)
    })

    it('captures selected preview as PNG and WebP through screenshot service', () => {
      cy.get('[aria-label="Screenshot"][aria-haspopup="dialog"]').click()
      for (const [label, extension, mimeType] of [['PNG', 'png', 'image/png'], ['WebP', 'webp', 'image/webp']]) {
        cy.contains('[aria-label="Screenshot format"] button', label).click()
        cy.contains('[role="dialog"][aria-label="Screenshot"] button', /^Capture 1 frame$/).click()
        cy.contains('[role="dialog"][aria-label="Screenshot"] [role="status"]', '1 frame captured', { timeout: 60000 }).should('be.visible')
        cy.get('[role="dialog"][aria-label="Screenshot"] img').first().should(($image) => {
          expect($image[0].src).to.match(new RegExp(`\\.${extension}$`))
          expect($image[0].naturalWidth).to.be.greaterThan(0)
        }).invoke('attr', 'src').then((url) => {
          cy.request({ url, encoding: 'binary' }).its('headers.content-type').should('equal', mimeType)
        })
      }
    })
  })
}

describe('Vue workbench integration', () => {
  beforeEach(() => {
    cy.viewport(1600, 1000)
  })

  it('shows collected prop defaults and restores them after removing an override', () => {
    cy.visit('/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0')
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[data-test-id="story-controls"] input[aria-label="message"]').should('have.value', 'Hello world!').clear().type('Native prop edit')
    cy.getPreviewIframeBody().contains('Native prop edit')
    cy.get('[aria-label="Remove message override"]').should('not.be.disabled').click()
    cy.get('[data-test-id="story-controls"] input[aria-label="message"]').should('have.value', 'Hello world!')
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.get('[aria-label="Remove message override"]').should('be.disabled')
  })

  it('applies matrix axes and base props to real cells and restores URL choices', () => {
    cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId=default')
    cy.getPreviewIframeBody().contains('Matrix message')
    cy.get('[aria-label="Props matrix"]').should('not.be.disabled').click()
    cy.location('search').should('include', 'arrange=matrix')
    cy.get('[aria-label^="Measure"]').should('be.disabled')
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const values = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]')?.textContent.trim())
      expect(values).to.have.members([
        'Matrix message · enabled=false · emphasized=false',
        'Matrix message · enabled=false · emphasized=true',
        'Matrix message · enabled=true · emphasized=false',
        'Matrix message · enabled=true · emphasized=true',
      ])
    })
    cy.contains('[aria-label="Matrix base props"] .histoire-matrix-base-prop', 'message').find('input').clear().type('Across every cell')
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      for (const frame of $frames) expect(frame.contentDocument.body.textContent).to.contain('Across every cell')
    })
    cy.contains('[aria-label="enabled values"] button', /^false$/).click()
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 2)
    cy.get('[aria-label="Swap matrix axes"]').click()
    cy.location('search').should('include', 'rows=emphasized').and('include', 'cols=enabled')
    cy.get('[aria-label="Select matrix cell false · true"]').click().should('have.attr', 'aria-pressed', 'true')
    cy.get('[aria-label="Measure"]').should('not.be.disabled')
    selectControl('Base preset', 'Alternate')
    cy.location('search').should('include', 'variantId=alternate')
    cy.reload()
    cy.location('search').should('include', 'rows=emphasized').and('include', 'cols=enabled')
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 2)
    cy.get('button[aria-label="Base preset"]').should('contain', 'Alternate')
    cy.contains('[aria-label="Matrix base props"] .histoire-matrix-base-prop', 'message').find('input').should('have.value', 'Across every cell')
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      expect($frames).to.have.length(2)
      for (const frame of $frames) expect(frame.contentDocument.body.textContent).to.contain('Across every cell').and.contain('enabled=true')
    })
  })

  it('detects no-hint chooser axes, switches exact base preset, and isolates long cell overrides', () => {
    cy.visit('/story/src-components-workbenchmatrix-story-vue?variantId')
    cy.get('[aria-label="Props matrix"]').should('not.be.disabled').click()
    cy.location('search').should('include', 'arrange=matrix').and('not.include', 'variantId=default')
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 4)
    cy.reload()
    cy.location('search').should('include', 'arrange=matrix').and('not.include', 'variantId=default')
    cy.get('[aria-label^="Select matrix cell "]', { timeout: 20000 }).should('have.length', 4)
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const values = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]')?.textContent.trim())
      expect(values).to.have.members([
        'Matrix message · enabled=false · emphasized=false',
        'Matrix message · enabled=false · emphasized=true',
        'Matrix message · enabled=true · emphasized=false',
        'Matrix message · enabled=true · emphasized=true',
      ])
    })
    cy.get('[aria-label="Select matrix cell false · true"]').click()
    selectControl('Base preset', 'Alternate')
    cy.location('search').should('include', 'variantId=alternate')
    // Base selection replaces four passive documents; await actual preview admission.
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      for (const frame of $frames) expect(frame.contentDocument.body.textContent).to.contain('Alternate preset')
    })
    cy.get('[aria-label="Select matrix cell false · true"]').click()
    cy.window().then((window) => {
      cy.stub(window.navigator.clipboard, 'writeText').resolves().as('matrixClipboard')
    })
    cy.contains('button', /^Save as variant$/).should('not.be.disabled').click()
    cy.get('@matrixClipboard').should('have.been.calledWithMatch', 'Alternate preset')
    cy.contains('[aria-live="polite"]', 'Variant snippet copied').should('be.visible')
    selectControl('Rows', 'tone')
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const tones = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]')?.getAttribute('data-tone'))
      expect(tones).to.have.members(['short', 'short', 'x'.repeat(500), 'x'.repeat(500)])
    })
    cy.get('[role="alert"]').should('not.exist')
    cy.get('[aria-label="Grid"]').click()
    cy.getPreviewIframeBody().find('[data-test-id="matrix-values"]').should('contain', 'Alternate preset').and('contain', 'enabled=false').and('contain', 'emphasized=false').and('have.attr', 'data-tone', 'short')
  })

  it('selects canvas variants and routes controls to selected preview', () => {
    cy.visit('/story/src-components-sharedcontrols-story-vue?variantId=src-components-sharedcontrols-story-vue-0')
    cy.getPreviewIframeBody().contains('Variant 1')
    cy.contains('[data-frame-id] > button', /^variant 3$/).click()
    cy.location('search').should('include', 'variantId=src-components-sharedcontrols-story-vue-2')
    cy.get('[data-test-id="story-side-panel"] h2').should('have.text', 'variant 3')
    cy.getControlsIframeBody().find('input[type="text"]').first().clear().type('Selected frame edit')
    cy.getPreviewIframeBody().find('[data-test-id="shared-controls-state"]').should('contain', 'Selected frame edit')
    cy.getControlsIframeBody().find('button[aria-label="HstSelect"]').click()
    cy.contains('[role="listbox"] [role="option"]', 'Ghost of Tsushima').click()
    cy.getPreviewIframeBody().find('[data-test-id="shared-controls-state"]').should('contain', 'ghost-of-tsushima')
    cy.contains('[data-frame-id] > button', /^variant 1$/).click()
    cy.getPreviewIframeBody().find('[data-test-id="shared-controls-state"]').should('contain', 'Hello').and('not.contain', 'Selected frame edit')
    cy.contains('[data-frame-id] > button', /^variant 3$/).click()
    cy.getPreviewIframeBody().find('[data-test-id="shared-controls-state"]').should('contain', 'Selected frame edit')
  })

  it('preserves docs tab deep link and reveals generated and story-file source', () => {
    cy.visit('/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0')
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.contains('[aria-label="Inspector"] [role="tab"]', /^\s*Docs\s*$/).click()
    cy.location('search').should('include', 'tab=docs')
    cy.contains('[aria-label="Histoire documentation"] h1', 'Title 1').should('be.visible')
    cy.reload()
    cy.contains('[aria-label="Inspector"] [role="tab"]', /^\s*Docs\s*$/).should('have.attr', 'aria-selected', 'true')
    cy.get('[aria-label="Expand source"]').click()
    cy.get('[data-test-id="story-source-code"] code').should('contain', 'Hello world!')
    cy.contains('[aria-label="Source mode"] button', /^\s*Story file\s*$/).click()
    cy.get('[data-test-id="story-source-code"] code').should('contain', '<Story').and('contain', '<docs')
    cy.contains('[aria-label="Inspector"] [role="tab"]', /^\s*Props\s*$/).click()
    cy.location('search').should('not.include', 'tab=docs')
    cy.get('[data-test-id="story-controls"]').should('be.visible')
  })

  it('collects events from selected runtime and displays inline arguments', () => {
    cy.visit('/story/src-components-eventbutton-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('button', 'Send').click()
    cy.get('[aria-label="1 unseen events"]').should('be.visible')
    cy.contains('[aria-label="Inspector"] [role="tab"]', /^Events/).click()
    cy.location('search').should('include', 'tab=events')
    cy.get('[aria-label="1 unseen events"]').should('not.exist')
    cy.contains('[data-test-id="event-item"] button', 'My event').click()
    cy.get('[data-test-id="event-item"] pre').should('contain', 'Hello').and('contain', 'World')
    cy.getPreviewIframeBody().contains('button', /^\s*Click\s*$/).click()
    cy.get('[data-test-id="event-item"]').should('have.length', 2)
  })

  it('opens search with Ctrl+K, filters scopes, and navigates docs and props', () => {
    cy.visit('/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0')
    cy.getPreviewIframeBody().contains('Hello world!')
    cy.getPreviewIframeBody().trigger('keydown', {
      eventConstructor: 'KeyboardEvent',
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    cy.get('[aria-label="Search stories, docs and props"]').should('be.focused').type('{esc}')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'k', code: 'KeyK', ctrlKey: true })
    cy.get('[aria-label="Search stories, docs and props"]').should('be.focused').type('Demo')
    cy.contains('[aria-label="Search scope"] button', /^Stories$/).click()
    cy.get('[data-test-id="search-item"]:is([data-search-kind="story"], [data-search-kind="variant"])').should('have.length.greaterThan', 1)
    cy.get('[data-test-id="search-item"][data-search-kind="docs"]').should('not.exist')
    cy.get('[aria-label="Search stories, docs and props"]').clear().type('message')
    cy.contains('[aria-label="Search scope"] button', /^Props$/).click()
    cy.contains('[data-test-id="search-item"][data-search-kind="prop"]', 'message').click()
    cy.location('search').should('include', 'variantId=src-components-demo-story-vue-0')
    cy.get('[aria-label="Search stories, docs and props"]').clear().type('Title 1')
    cy.contains('[aria-label="Search scope"] button', /^Docs$/).click()
    cy.contains('[data-test-id="search-item"][data-search-kind="docs"]', 'Demo').click()
    cy.location('search').should('include', 'tab=docs')
    cy.contains('[aria-label="Histoire documentation"] h1', 'Title 1').should('be.visible')
    cy.get('[aria-label="Search stories, docs and props"]').type('{esc}')
    cy.get('[data-test-id="search-modal"]').should('not.exist')
    cy.get('[aria-label="Workbench"] [aria-label="Search"]').should('be.focused')
  })
})
