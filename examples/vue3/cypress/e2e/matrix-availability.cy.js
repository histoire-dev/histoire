/// <reference types="cypress" />

describe('Props matrix availability', () => {
  beforeEach(() => cy.viewport(1600, 1000))

  it('opens BaseButton matrix with reason and fix, preserving selected variant', () => {
    const variantId = 'src-components-basebutton-story-vue-0'
    cy.visit(`/story/src-components-basebutton-story-vue?variantId=${variantId}`)
    cy.get('[aria-label="Props matrix"]').should('not.be.disabled').click()
    cy.location('search').should('include', 'arrange=matrix').and('include', `variantId=${variantId}`)
    cy.contains('[role="status"]', 'Matrix needs two prop axes', { timeout: 20000 }).should('be.visible').and('contain', 'Only disabled has at least two known values').and('contain', 'Add a custom axis').and('contain', 'Story matrix.axes')
    cy.get('[aria-label^="Select matrix cell "]').should('not.exist')
    cy.get('[data-frame-id]').should('not.exist')
    cy.get('[aria-label="Swap matrix axes"]').should('not.exist')
    cy.get('[aria-label="Grid"]').click()
    cy.getPreviewIframeBody().contains('Click me').click()
    cy.location('search').should('include', `variantId=${variantId}`).and('include', 'arrange=grid')
  })

  it('explains zero axes after runtime discovery completes', () => {
    cy.visit('/story/src-components-demo-story-vue?arrange=matrix&variantId=src-components-demo-story-vue-0')
    cy.contains('[role="status"]', 'Matrix needs two prop axes', { timeout: 20000 }).should('be.visible').and('contain', 'No prop has at least two known values').and('contain', 'Boolean and numeric props are detected automatically').and('contain', 'Story matrix.axes')
    cy.contains('[role="status"]', 'Reading prop axes').should('not.exist')
    cy.get('[data-frame-id]').should('not.exist')
    // Guidance action reveals the inspector's new-axis form, even when closed.
    cy.get('[aria-label="Close inspector"]').click()
    cy.contains('button', 'Add custom axis').click()
    cy.get('form[aria-label="Add matrix axis"]').should('be.visible').find('input[aria-label="Prop name"]').should('have.focus')
  })

  it('keeps matrix loading visible until its discovery document responds', () => {
    cy.visit('/')
    let releaseResponse
    cy.intercept('GET', '**/__sandbox.html*', (request) => {
      if (!request.url.includes('variantId=src-components-basebutton-story-vue-0')) return request.continue()
      return new Promise((resolve) => {
        releaseResponse = () => {
          request.continue()
          resolve()
        }
      })
    })
    // Restore matrix through browser navigation before any variant has supplied metadata.
    cy.window().then((window) => {
      window.history.pushState(null, '', '/story/src-components-basebutton-story-vue?arrange=matrix&variantId=src-components-basebutton-story-vue-0')
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    cy.contains('[role="status"]', 'Reading prop axes').should('be.visible')
    cy.get('[aria-label="Props matrix"]').should('have.attr', 'aria-pressed', 'true')
    cy.get('[data-frame-id]').should('not.exist')
    cy.wrap(null).should(() => expect(releaseResponse).to.be.a('function')).then(() => releaseResponse())
    cy.contains('[role="status"]', 'Matrix needs two prop axes', { timeout: 20000 }).should('be.visible')
    cy.contains('[role="status"]', 'Reading prop axes').should('not.exist')
  })

  it('shows discovery failure and recovers ordinary canvas after runtime requests resume', () => {
    let rejectRuntime = true
    cy.intercept('GET', '**/__sandbox.html*', (request) => {
      if (rejectRuntime) request.reply({ statusCode: 500, body: 'Runtime unavailable' })
      else request.continue()
    })
    cy.visit('/story/src-components-basebutton-story-vue?arrange=matrix&variantId=src-components-basebutton-story-vue-0')
    cy.contains('[role="status"]', 'Could not read prop axes', { timeout: 40000 }).should('be.visible').and('contain', 'Story runtime failed before prop values could be read')
    cy.contains('[role="status"]', 'Reading prop axes').should('not.exist')
    cy.then(() => rejectRuntime = false)
    cy.get('[aria-label="Grid"]').click()
    cy.getPreviewIframeBody().contains('Click me').click()
    cy.location('search').should('include', 'arrange=grid').and('include', 'variantId=src-components-basebutton-story-vue-0')
  })

  it('discovers missing axes on direct chooser entry without selecting a variant', () => {
    cy.visit('/story/src-components-basebutton-story-vue?arrange=matrix&variantId')
    cy.contains('[role="status"]', 'Matrix needs two prop axes', { timeout: 20000 })
      .should('be.visible')
      .and('contain', 'Only disabled has at least two known values')
    cy.location('search').should('include', 'arrange=matrix').and('not.include', 'variantId=src-components')
    cy.get('[data-frame-id]').should('not.exist')
    cy.reload()
    cy.contains('[role="status"]', 'Matrix needs two prop axes', { timeout: 20000 }).should('be.visible')
    cy.location('search').should('not.include', 'variantId=src-components')
  })

  it('discovers valid chooser matrix and distinguishes empty filters', () => {
    cy.visit('/story/src-components-workbenchmatrix-story-vue?arrange=matrix&variantId')
    cy.get('[aria-label^="Select matrix cell "]', { timeout: 20000 }).should('have.length', 4)
    cy.location('search').should('include', 'arrange=matrix').and('not.include', 'variantId=default')
    cy.get('[data-test-id="preview-iframe-passive"]', { timeout: 20000 }).should(($frames) => {
      const values = [...$frames].map(frame => frame.contentDocument?.querySelector('[data-test-id="matrix-values"]')?.textContent.trim())
      expect(values).to.have.members([
        'Matrix message · enabled=false · emphasized=false',
        'Matrix message · enabled=false · emphasized=true',
        'Matrix message · enabled=true · emphasized=false',
        'Matrix message · enabled=true · emphasized=true',
      ])
    })
    cy.contains('[aria-label="enabled values"] button', /^false$/).click()
    cy.contains('[aria-label="enabled values"] button', /^true$/).click()
    cy.contains('[role="status"]', 'No values selected').should('be.visible').and('contain', 'Enable row and column values in Props')
    cy.get('[aria-label^="Select matrix cell "]').should('not.exist')
    cy.contains('[aria-label="enabled values"] button', /^true$/).click()
    cy.get('[aria-label^="Select matrix cell "]').should('have.length', 2)
  })
})
