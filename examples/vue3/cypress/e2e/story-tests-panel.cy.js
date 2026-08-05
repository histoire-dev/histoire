/// <reference types="cypress" />

describe('Preview tests panel', () => {
  const storyPath = 'src/components/VitestMocking.story.vue'
  const hmrInsertionMarker = '    // HMR_TEST_INSERTION_POINT'
  let originalStorySource = ''

  function openTestsPanel() {
    cy.get('[data-test-id="story-tests-tab"]:visible').click()
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.get('[data-test-id="story-side-panel"]').contains('Loading...').should('not.exist')
  }

  function assertCollectedDefinitions(count) {
    cy.get('iframe[data-test-id="preview-iframe"]')
      .its('0.contentWindow.__HST_TEST_DEFINITIONS__')
      .should((definitions) => {
        expect(Array.isArray(definitions)).to.equal(true)
        expect(definitions).to.have.length(count)
      })
  }

  function assertTestsTabCount(count) {
    cy.get('[data-test-id="story-tests-tab-count"]:visible')
      .should('have.text', `${count}`)
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
    cy.visit('/')

    cy.openVitestStory()
    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    cy.assertMockedGreeting()

    openTestsPanel()
    cy.contains('button', 'Run tests').should('be.visible')
    cy.get('[data-test-id="story-test-row"]').should('have.length', 3)
    cy.get('[data-test-id="story-test-row"]').each(($row) => {
      cy.wrap($row).contains('Not run')
    })

    cy.contains('button', 'Run tests').click()
    cy.get('[data-test-id="story-test-row"]').should('have.length', 3)
    cy.contains('[data-test-id="story-test-row"]', 'renders the mocked dependency output').contains('passed')
    cy.contains('[data-test-id="story-test-row"]', 'tracks calls through the mocked module function').contains('passed')
    // The story declares this one with `it.skip`, so it must be reported as
    // skipped and must not produce the failure it would otherwise throw.
    cy.contains('[data-test-id="story-test-row"]', 'fails').as('skippedRow')
    cy.get('@skippedRow').contains('skipped')
    cy.get('@skippedRow').should('not.contain', 'This test is expected to fail')
  })

  it('refreshes mocked story tests after hot updates', () => {
    cy.viewport(1600, 1000)
    cy.visit('/')

    cy.openVitestStory()
    openTestsPanel()
    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    cy.get('[data-test-id="story-test-row"]').should('have.length', 3)
    cy.assertMockedGreeting()

    cy.then(() => {
      const updatedStorySource = originalStorySource.replace(hmrInsertionMarker, `    it('updates the tests panel after hot reload', () => {
      expect(canvas.textContent).toContain('Mocked by Vitest for Vitest browser mode')
    })
${hmrInsertionMarker}`)

      expect(updatedStorySource).not.to.equal(originalStorySource)
      cy.writeFile(storyPath, updatedStorySource)
    })

    assertCollectedDefinitions(4)
    assertTestsTabCount(4)
    cy.get('[data-test-id="story-test-row"]', {
      timeout: 20000,
    }).should('have.length', 4)
    cy.assertMockedGreeting()

    cy.writeFile(storyPath, originalStorySource)

    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    cy.get('[data-test-id="story-test-row"]', {
      timeout: 20000,
    }).should('have.length', 3)
    cy.assertMockedGreeting()
  })
})
