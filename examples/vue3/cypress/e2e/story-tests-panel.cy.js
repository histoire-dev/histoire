/// <reference types="cypress" />

describe('Preview tests panel', () => {
  const storyPath = 'src/components/VitestMocking.story.vue'
  const hmrInsertionMarker = '    // HMR_TEST_INSERTION_POINT'
  let originalStorySource = ''

  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  const assertMockedGreeting = () => {
    getIframeBody().find('iframe').should('have.length', 0)
    getIframeBody().contains('Mocked by Vitest for Vitest browser mode', {
      timeout: 20000,
    })
    getIframeBody().should('not.contain', 'Failed to resolve vitest:mocks:resolveMock in time')
  }

  function openVitestStory() {
    cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking').click()
    cy.location('search').should('include', 'variantId=src-components-vitestmocking-story-vue-0')
  }

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

    openVitestStory()
    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    assertMockedGreeting()

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
    cy.contains('[data-test-id="story-test-row"]', 'fails').as('failedRow')
    cy.get('@failedRow').contains('failed')
    cy.get('@failedRow').contains('This test is expected to fail')
  })

  it('refreshes mocked story tests after hot updates', () => {
    cy.viewport(1600, 1000)
    cy.visit('/')

    openVitestStory()
    openTestsPanel()
    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    cy.get('[data-test-id="story-test-row"]').should('have.length', 3)
    assertMockedGreeting()

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
    assertMockedGreeting()

    cy.writeFile(storyPath, originalStorySource)

    assertCollectedDefinitions(3)
    assertTestsTabCount(3)
    cy.get('[data-test-id="story-test-row"]', {
      timeout: 20000,
    }).should('have.length', 3)
    assertMockedGreeting()
  })
})
