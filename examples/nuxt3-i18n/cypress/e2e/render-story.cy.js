/// <reference types="cypress" />

describe('Story render', () => {
  const getIframeBody = () => cy.get('iframe[data-test-id="preview-iframe"]')
    .its('0.contentDocument.body').should('not.be.empty')
    .then(cy.wrap)

  it('should display the story content', () => {
    cy.visit('/story/components-simple-story-vue?variantId=_default')
    getIframeBody().contains('Simple story in Nuxt NuxtLink')
  })

  it('should render an empty `nuxt-test` app', () => {
    cy.visit('/story/components-simple-story-vue?variantId=_default')
    getIframeBody().find('#nuxt-test[data-v-app]').should('be.empty')
  })

  it('should render auto-imported components', () => {
    cy.visit('/story/components-autoimport-story-vue?variantId=_default')
    getIframeBody().contains('Meow')
  })

  it('should render NuxtLink', () => {
    cy.visit('/story/components-basebuttonlink-story-vue?variantId=_default')
    cy.get('.histoire-generic-render-story a').contains('Hello world')
  })

  it('should render the public config populated from Nuxt', () => {
    cy.visit('/story/components-autoimport-story-vue?variantId=_default')
    getIframeBody().find('.histoire-generic-render-story p[data-testid="config"]').contains('test')
  })
})
