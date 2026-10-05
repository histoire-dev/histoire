/// <reference types="cypress" />

describe('Story render', () => {
  it('should display the story content', () => {
    cy.visit('/story/app-components-simple-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('Simple story in Nuxt NuxtLink')
  })

  it('should render isolated variant app without extra Nuxt entry root', () => {
    cy.visit('/story/app-components-simple-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('Simple story in Nuxt')
    cy.getPreviewIframeBody().find('[data-histoire-runtime-content]').should('have.length', 1)
    cy.getPreviewIframeBody().find('#nuxt-test').should('not.exist')
  })

  it('should render auto-imported components', () => {
    cy.visit('/story/app-components-autoimport-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('Meow')
  })

  it('should render NuxtLink', () => {
    cy.visit('/story/app-components-basebuttonlink-story-vue?variantId=app-components-basebuttonlink-story-vue-0')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story a').contains('Hello world')
  })

  it('should render the public config populated from Nuxt', () => {
    cy.visit('/story/app-components-autoimport-story-vue?variantId=_default')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story p[data-testid="config"]').contains('test')
  })
})
