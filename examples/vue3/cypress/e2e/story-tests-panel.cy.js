/// <reference types="cypress" />

import { visitStories } from '../../../cypress/workbench-actions.js'

const describeTests = Cypress.env('workbenchMode') === 'dev' ? describe : describe.skip

describeTests('Preview tests panel', () => {
  const storyPath = 'src/components/VitestMocking.story.vue'
  const hmrInsertionMarker = '    // HMR_TEST_INSERTION_POINT'
  let originalStorySource = ''

  /** Opens selected runtime's preview test inspector. */
  function openTestsPanel() {
    cy.contains('[role="tab"]:visible', 'Tests').click()
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.getPreviewIframeBody()
  }

  /** Inspector badge acknowledges finite test definition collection. */
  function assertTestsTabCount(count) {
    cy.get(`[aria-label="${count} collected tests"]:visible`, { timeout: 20000 })
      .should($count => expect($count.text().trim()).to.equal(`${count}`))
  }

  beforeEach(() => {
    cy.readFile(storyPath).then((source) => {
      originalStorySource = source
    })
  })

  afterEach(() => {
    if (!originalStorySource) {
      return
    }

    cy.writeFile(storyPath, originalStorySource)
  })

  it('collects story tests registered from a single onTest callback', () => {
    cy.viewport(1600, 1000)
    visitStories()

    cy.openVitestStory()
    assertTestsTabCount(3)
    cy.assertMockedGreeting()

    openTestsPanel()
    cy.contains('button', 'Run preview').should('be.visible')
    cy.get('[aria-label="Histoire tests"] li').should('have.length', 3)
    // The runnable tests start as "Not run"; the `it.skip` one is known to be
    // skipped before anything runs, so it reports that from the start.
    cy.contains('[aria-label="Histoire tests"] li', 'renders the mocked dependency output').contains('Not run')
    cy.contains('[aria-label="Histoire tests"] li', 'tracks calls through the mocked module function').contains('Not run')
    cy.contains('[aria-label="Histoire tests"] li', 'fails').contains('Skipped')

    cy.contains('button', 'Run preview').click()
    cy.get('[aria-label="Histoire tests"] li').should('have.length', 3)
    cy.contains('[aria-label="Histoire tests"] li', 'renders the mocked dependency output').contains('passed')
    cy.contains('[aria-label="Histoire tests"] li', 'tracks calls through the mocked module function').contains('passed')
    // The story declares this one with `it.skip`, so it must be reported as
    // skipped and must not produce the failure it would otherwise throw.
    cy.contains('[aria-label="Histoire tests"] li', 'fails').as('skippedRow')
    cy.get('@skippedRow').contains('skipped')
    cy.get('@skippedRow').should('not.contain', 'This test is expected to fail')
  })

  // Hot updates only exist while the dev server is running. `histoire preview`
  // (what CI serves) is a static build of the book, so this is skipped there
  // rather than failing: run the suite against `histoire dev` to cover it.
  it('refreshes mocked story tests after hot updates', function () {
    cy.viewport(1600, 1000)
    visitStories()

    cy.document().then((doc) => {
      if (!doc.querySelector('script[src*="/@vite/client"]')) {
        this.skip()
      }
    })

    cy.openVitestStory()
    openTestsPanel()
    assertTestsTabCount(3)
    cy.get('[aria-label="Histoire tests"] li').should('have.length', 3)
    cy.assertMockedGreeting()

    cy.then(() => {
      const updatedStorySource = originalStorySource.replace(hmrInsertionMarker, `    it('updates the tests panel after hot reload', () => {
      expect(canvas.textContent).toContain('Mocked by Vitest for Vitest browser mode')
    })
${hmrInsertionMarker}`)

      expect(updatedStorySource).not.to.equal(originalStorySource)
      cy.writeFile(storyPath, updatedStorySource)
    })

    assertTestsTabCount(4)
    cy.get('[aria-label="Histoire tests"] li', {
      timeout: 20000,
    }).should('have.length', 4)
    cy.assertMockedGreeting()

    cy.writeFile(storyPath, originalStorySource)

    assertTestsTabCount(3)
    cy.get('[aria-label="Histoire tests"] li', {
      timeout: 20000,
    }).should('have.length', 3)
    cy.assertMockedGreeting()
  })
})
