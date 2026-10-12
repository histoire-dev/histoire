/// <reference types="cypress" />

/** Persistent canvas menu entry remains available after workbench chrome hides. */
const canvas = '[aria-label="Story canvas"]'
/** Shared menu excludes unrelated control dropdowns. */
const menu = '.histoire-context-menu[role="menu"]'
/** Exact selected regular frame or selected matrix cell retains its document. */
const selectedFrame = '[data-frame-id].is-selected iframe, [data-frame-id][data-selected="true"] iframe'
/** Matrix provides finite axes and editable props in every arrangement. */
const story = '/story/src-components-workbenchmatrix-story-vue?variantId=default'

/** Horizontal offset clearing side panel resize handle, which straddles canvas edge by 4px. */
const backgroundX = 12

/** Open from canvas background through the real event handlers. */
function openCanvasMenu(keyboard = false) {
  if (keyboard) cy.get(canvas).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'F10', shiftKey: true, force: true })
  else cy.get(canvas).rightclick(backgroundX, 2)
  cy.get(menu).should('be.visible')
}

/** Reset persistent panel preferences so restoration expectations stay explicit. */
function visitCanvas(arrange) {
  cy.viewport(1600, 1000)
  cy.visit(`${story}&arrange=${arrange}${arrange === 'matrix' ? '&rows=enabled&cols=emphasized' : ''}`, {
    onBeforeLoad(window) {
      window.localStorage.clear()
      window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true }))
    },
  })
  if (arrange === 'matrix') cy.get('[aria-label="Select matrix cell false · false"]').click()
  cy.get(selectedFrame).should('have.length', 1).should(($frames) => {
    expect($frames[0].contentDocument?.body.textContent).to.contain('Matrix message')
  })
}

describe('UI visibility context menus', () => {
  for (const arrange of ['single', 'grid', 'list', 'matrix']) {
    it(`hides and restores ${arrange} chrome while preserving story document and edits`, () => {
      visitCanvas(arrange)
      const message = `Retained ${arrange} edit`
      const input = arrange === 'matrix' ? '[aria-label="Matrix base props"] input[aria-label="message"]' : '[data-test-id="story-controls"] input[aria-label="message"]'
      cy.get(input).clear().type(message)
      cy.get(selectedFrame).should(($frames) => {
        expect($frames[0].contentDocument?.body.textContent).to.contain(message)
      }).then(($frames) => {
        const document = $frames[0].contentDocument
        cy.location('href').then((href) => {
          openCanvasMenu()
          cy.get(`${menu} [role="menuitem"]`).last().should('contain', 'Hide UI').click()
          cy.get(menu).should('not.exist')
          cy.get('[aria-label="Workbench"]').should('not.exist')
          cy.get('[aria-label="Hide UI"]').should('not.exist')
          cy.get(selectedFrame).should(($retained) => {
            expect($retained[0].contentDocument).to.equal(document)
            expect(document.body.textContent).to.contain(message)
          })
          openCanvasMenu(true)
          cy.contains(`${menu} [role="menuitem"]`, 'Show UI').should('be.visible')
          cy.get(menu).trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'Escape' })
          cy.get(menu).should('not.exist')
          cy.get(canvas).should('be.focused')
          cy.get('[aria-label="Workbench"]').should('not.exist')
          // Single fills its canvas with native story content while chrome is hidden.
          openCanvasMenu(arrange === 'single')
          cy.contains(`${menu} [role="menuitem"]`, 'Show UI').click()
          cy.get(menu).should('not.exist')
          cy.get('[aria-label="Workbench"]').should('be.visible')
          cy.get('[aria-label="Hide UI"]').should('be.visible')
          cy.get(input).should('have.value', message)
          cy.location('href').should('equal', href)
          cy.get(selectedFrame).should(($retained) => {
            expect($retained[0].contentDocument).to.equal(document)
          })
        })
      })
    })
  }

  for (const source of ['toolbar', 'shortcut']) {
    it(`restores UI through keyboard menu after hiding with ${source}`, () => {
      visitCanvas('single')
      if (source === 'toolbar') cy.get('[aria-label="Hide UI"]').click()
      else cy.get(canvas).focus().trigger('keydown', { eventConstructor: 'KeyboardEvent', key: 'h', ctrlKey: true, shiftKey: true })
      cy.get('[aria-label="Workbench"]').should('not.exist')
      openCanvasMenu(true)
      cy.contains(`${menu} [role="menuitem"]`, 'Show UI').focus().type('{enter}')
      cy.get(menu).should('not.exist')
      cy.get('[aria-label="Workbench"]').should('be.visible')
    })
  }
})
