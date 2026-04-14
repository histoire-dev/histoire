/// <reference types="cypress" />

describe('Vitest story runtime', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body')
    .should('not.be.empty')
    .then(cy.wrap)

  const assertMockedGreeting = () => {
    getIframeBody().find('iframe').should('have.length', 0)
    getIframeBody().contains('Mocked by Vitest for Vitest browser mode', {
      timeout: 10000,
    })
  }

  function openVitestStory() {
    cy.get('[data-test-id="story-list-item"]').contains('Vitest Mocking').click()
    cy.location('search').should('include', 'variantId=src-components-vitestmocking-story-vue-0')

    cy.get('body').then(($body) => {
      if ($body.find('[data-test-id="story-variant-list-item"]').length) {
        cy.contains('[data-test-id="story-variant-list-item"]', 'mocked module in story setup').click()
      }
    })
  }

  it('reopens the story without losing the manual Vitest mock state', () => {
    cy.viewport(1600, 1000)
    cy.visit('/')
    openVitestStory()

    assertMockedGreeting()

    cy.get('[data-test-id="story-list-item"]').contains('BaseButton').click()
    cy.location('pathname').should('include', '/story/src-components-basebutton-story-vue')

    openVitestStory()
    assertMockedGreeting()
  })

  it('shows the tests pane without getting stuck in loading', () => {
    cy.viewport(1600, 1000)
    cy.visit('/')
    openVitestStory()

    cy.contains('button, a', 'Tests').click()
    cy.get('[data-test-id="story-side-panel"]').should('be.visible')
    cy.get('[data-test-id="story-side-panel"]').contains('Loading...').should('not.exist')
    cy.contains('button', 'Run tests').should('be.visible')
  })
})
