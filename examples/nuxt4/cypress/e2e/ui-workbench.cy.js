/// <reference types="cypress" />

import { describeWorkbenchContract } from '../../../cypress/workbench-contract.js'

describeWorkbenchContract({
  path: '/story/app-components-simple-story-vue?variantId=_default',
  previewText: 'Simple story in Nuxt',
})
