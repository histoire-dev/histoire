/// <reference types="cypress" />

describe('Story render', () => {
  it('should display the story content', () => {
    cy.visit('/story/app-components-simple-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('Simple story in Nuxt NuxtLink')
  })

  it('should render an empty `nuxt-test` app', () => {
    cy.visit('/story/app-components-simple-story-vue?variantId=_default')
    cy.getPreviewIframeBody().find('#nuxt-test[data-v-app]').should('be.empty')
  })

  it('should render auto-imported components', () => {
    cy.visit('/story/app-components-autoimport-story-vue?variantId=_default')
    cy.getPreviewIframeBody().contains('Meow')
  })

  it('should render NuxtLink', () => {
    cy.visit('/story/app-components-basebuttonlink-story-vue?variantId=_default')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story a').contains('Hello world')
  })

  it('should render the public config populated from Nuxt', () => {
    cy.visit('/story/app-components-autoimport-story-vue?variantId=_default')
    cy.getPreviewIframeBody().find('.histoire-generic-render-story p[data-testid="config"]').contains('test')
  })
})
