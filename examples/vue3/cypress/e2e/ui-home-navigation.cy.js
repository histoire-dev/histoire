/// <reference types="cypress" />

/** Persist only shell preferences; unrelated browser state stays untouched. */
const storageKey = '_histoire-ui-shell'
/** Home route state and expanded pane state have independent rail controls. */
const rail = '[aria-label="Workbench"]'
/** Existing story fixture supplies real navigation from Home and back. */
const storyPath = '/story/src-components-demo-story-vue?variantId=src-components-demo-story-vue-0'

/**
 * Load exact shell preferences before workbench restores browser storage.
 * @param {string} path Existing standalone route.
 * @param {object} [saved] Optional persisted shell state.
 */
function visit(path, saved) {
  cy.visit(path, {
    onBeforeLoad(window) {
      if (saved) window.localStorage.setItem(storageKey, JSON.stringify(saved))
      else window.localStorage.removeItem(storageKey)
    },
  })
}

/** Assert route and pane through public navigation and accessibility contracts. */
function assertHomeStories() {
  cy.location('pathname').should('equal', '/')
  cy.get(`${rail} [aria-label="Home"]`).should('have.attr', 'aria-pressed', 'true')
  cy.get(`${rail} [aria-label="Stories"]`).should('have.attr', 'aria-expanded', 'true')
  cy.get(`${rail} [data-shell-pane][aria-pressed="true"]`).should('have.length', 1)
  cy.get('[aria-label="stories panel"]').should('be.visible')
}

describe('Home and Stories navigation', () => {
  beforeEach(() => cy.viewport(1600, 1000))

  it('opens Stories on fresh Home startup', () => {
    visit('/')
    assertHomeStories()
    cy.screenshot('home-stories-desktop', { capture: 'viewport' })
  })

  for (const panelOpen of [true, false]) {
    it(`restores saved Search ${panelOpen ? 'open' : 'closed'} on Home startup`, () => {
      visit('/', { pane: 'search', panelOpen, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 })
      cy.get(`${rail} [aria-label="Home"]`).should('have.attr', 'aria-pressed', 'true')
      cy.get(`${rail} [aria-label="Search"]`).should('have.attr', 'aria-expanded', String(panelOpen))
      cy.get(`${rail} [aria-label="Search"]`).should('have.attr', 'aria-pressed', 'false')
      cy.get('[aria-label="search panel"]').should(panelOpen ? 'be.visible' : 'not.exist')
      cy.window().then((window) => {
        expect(JSON.parse(window.localStorage.getItem(storageKey))).to.deep.equal({ pane: 'search', panelOpen, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 })
      })
    })
  }

  for (const path of [storyPath, '/settings/appearance', '/']) {
    it(`opens Stories through Home from ${path}`, () => {
      visit(path, { pane: 'search', panelOpen: true })
      cy.get(`${rail} [aria-label="Home"]`).click()
      assertHomeStories()
      cy.get(`${rail} [aria-label="Home"]`).click()
      assertHomeStories()
    })
  }

  it('reopens Stories through Home while keeping pane toggle and persisted widths', () => {
    visit('/', { pane: 'stories', panelOpen: false, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 })
    cy.get(`${rail} [aria-label="Home"]`).click()
    assertHomeStories()
    cy.window().then((window) => {
      expect(JSON.parse(window.localStorage.getItem(storageKey))).to.deep.equal({ pane: 'stories', panelOpen: true, inspectorOpen: false, panelWidth: 310, inspectorWidth: 380 })
    })
    cy.get(`${rail} [aria-label="Stories"]`).click()
    cy.get('[aria-label="stories panel"]').should('not.exist')
    cy.get(`${rail} [aria-label="Home"]`).should('have.attr', 'aria-pressed', 'true').click()
    assertHomeStories()
    cy.reload()
    assertHomeStories()
  })

  it('retains configured external logo link without changing the active pane', () => {
    visit('/', { pane: 'search', panelOpen: true })
    cy.get('[aria-label="Histoire home"]').should('have.attr', 'target', '_blank').and('have.attr', 'rel', 'noopener noreferrer').invoke('attr', 'href').should('match', /^https?:\/\/histoire\.dev\/?$/)
    cy.get('[aria-label="search panel"]').should('be.visible')
  })

  it('opens Stories when browser history returns to Home', () => {
    visit('/')
    cy.get(`${rail} [aria-label="Home"]`).click()
    cy.get('[data-test-id="story-list-item"][aria-label="Demo"]').click()
    cy.location('pathname').should('equal', storyPath.split('?')[0])
    cy.get(`${rail} [aria-label="Search"]`).click()
    cy.go('back')
    assertHomeStories()
  })

  it('shows narrow startup overlay and dismisses it after story selection', () => {
    cy.viewport(390, 844)
    visit('/')
    assertHomeStories()
    cy.screenshot('home-stories-narrow', { capture: 'viewport' })
    cy.get('[aria-label="Close side panel"]').click({ position: 'right' })
    cy.get('[aria-label="stories panel"]').should('not.exist')
    cy.get(`${rail} [aria-label="Home"]`).click()
    assertHomeStories()
    cy.get('[data-test-id="story-list-item"][aria-label="Demo"]').click()
    cy.location('pathname').should('equal', storyPath.split('?')[0])
    cy.get('[aria-label="stories panel"]').should('not.exist')
    cy.get(`${rail} [aria-label="Home"]`).click()
    assertHomeStories()
  })
})
