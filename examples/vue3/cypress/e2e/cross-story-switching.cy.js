/// <reference types="cypress" />

import { getGeneratedSource, selectCanvasVariant } from '../../../cypress/workbench-actions.js'

const baseStory = 'src-components-basebutton-story-vue'
const codegenStory = 'src-components-codegen-story-vue'
const baseVariants = [`${baseStory}-0`, `${baseStory}-1`, `${baseStory}-2`]
const codegenVariants = ['html', 'props', 'boolean props', 'click-events', 'v-model', 'custom-directive', 'slots', 'slot-with-props', 'slot-with-props-named', 'list', 'function']

/** Returns frame wrapper selector for one collected story variant. */
function frameSelector(storyId, variantId) {
  return `[data-frame-id='${JSON.stringify([storyId, variantId])}']`
}

/** Sorts siblings by visible frame-center distance, then stable canvas DOM order. */
function nearestSiblingOrder(window) {
  const frames = [...window.document.querySelectorAll('.histoire-canvas-frame[data-frame-id]')]
    .flatMap((frame) => {
      try {
        const [storyId, variantId] = JSON.parse(frame.getAttribute('data-frame-id'))
        return storyId === codegenStory ? [{ variantId, frame }] : []
      }
      catch { return [] }
    })
  const domIndex = new Map(frames.map(({ variantId }, index) => [variantId, index]))
  const center = (element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  const selectedCenter = center(frames.find(frame => frame.variantId === 'html').frame)
  return frames.filter(frame => frame.variantId !== 'html').map(({ variantId, frame }) => {
    const point = center(frame)
    return { variantId, distance: Math.hypot(point.x - selectedCenter.x, point.y - selectedCenter.y) }
  }).sort((a, b) => a.distance - b.distance || domIndex.get(a.variantId) - domIndex.get(b.variantId)).map(row => row.variantId)
}

/** Waits until every expected frame has a usable host document. */
function expectAllFramesReady(storyId, variantIds) {
  cy.get('.histoire-canvas-frame[data-frame-id]', { timeout: 90000 }).should(($frames) => {
    const frames = [...$frames].filter((frame) => {
      try {
        return JSON.parse(frame.getAttribute('data-frame-id'))[0] === storyId
      }
      catch { return false }
    })
    expect(frames.map(frame => JSON.parse(frame.getAttribute('data-frame-id'))[1]).sort()).to.deep.equal([...variantIds].sort())
    for (const frame of frames) {
      const content = frame.querySelector('.histoire-frame-content')
      const replica = frame.querySelector('.histoire-canvas-replica')
      expect(content?.getAttribute('aria-busy'), `content ready for ${frame.dataset.frameId}`).to.equal('false')
      expect(content?.hasAttribute('inert'), `content interactive for ${frame.dataset.frameId}`).to.equal(false)
      expect(replica?.getAttribute('aria-busy'), `replica ready for ${frame.dataset.frameId}`).to.equal('false')
      expect(Boolean(replica?.querySelector('iframe')), `document admitted for ${frame.dataset.frameId}`).to.equal(true)
    }
  })
}

/** Opens one story through its real story-tree row. */
function selectStory(storyId) {
  cy.get(`[data-test-id="story-list-item"][data-tree-key*="${storyId}"]`).click()
  cy.location('pathname').should('include', `/story/${storyId}`)
}

/** Captures a concrete iframe, its document, and its per-mount document ID. */
function captureFrameDocument(storyId, variantId) {
  return cy.get(frameSelector(storyId, variantId)).find('iframe[title="Histoire variant"]').should('be.visible').then(($frames) => {
    const iframe = $frames[0]
    return {
      iframe,
      document: iframe.contentDocument,
      documentId: new URL(iframe.src).searchParams.get('documentId'),
    }
  })
}

/** Installs a low-cost host-ready timestamp before workbench code starts. */
function installReadyObserver(window) {
  const state = window.__crossStoryAdmissionProof = { readyAtByVariant: {} }
  const check = () => {
    for (const frame of window.document.querySelectorAll('.histoire-canvas-frame[data-frame-id]')) {
      let identity
      try {
        identity = JSON.parse(frame.getAttribute('data-frame-id'))
      }
      catch { continue }
      if (identity[0] !== codegenStory || state.readyAtByVariant[identity[1]] !== undefined) continue
      const content = frame.querySelector('.histoire-frame-content')
      const replica = frame.querySelector('.histoire-canvas-replica')
      if (content?.getAttribute('aria-busy') !== 'false' || content.hasAttribute('inert')) continue
      if (replica?.getAttribute('aria-busy') !== 'false' || !replica.querySelector('iframe')) continue
      if (identity[1] === 'html') {
        const rect = frame.getBoundingClientRect()
        if (!frame.querySelector('button[aria-pressed="true"]') || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue
      }
      state.readyAtByVariant[identity[1]] = Date.now()
    }
  }
  const observer = new window.MutationObserver(check)
  observer.observe(window.document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-busy', 'aria-pressed', 'class', 'inert', 'style'],
  })
  check()
}

describe('Cross-story frame admission', () => {
  beforeEach(() => {
    cy.viewport(1920, 1400)
  })

  it('readies selected frame before nearest-first sibling admission', () => {
    const requests = []
    let nearestFirst

    cy.intercept({ method: 'GET', pathname: '/__sandbox.html' }, (request) => {
      const url = new URL(request.url)
      const storyId = url.searchParams.get('storyId')
      const variantId = url.searchParams.get('variantId')
      if (storyId !== codegenStory || url.searchParams.get('controls') === 'true') {
        request.continue()
        return
      }

      const row = { variantId, startedAt: Date.now() }
      requests.push(row)
      request.continue(response => response.setDelay(variantId === 'html' ? 1400 : 250))
    })

    cy.visit(`/story/${codegenStory}?variantId=html&arrange=grid`, {
      onBeforeLoad(window) {
        window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
        installReadyObserver(window)
      },
    })
    cy.location('search').should('include', 'variantId=html')
    cy.wrap(null, { timeout: 15000 }).should(() => {
      expect(requests.length).to.be.greaterThan(0)
      expect(requests[0].variantId).to.equal('html')
    })
    cy.get('.histoire-canvas-frame[data-frame-id]').should(($frames) => {
      const codegenFrames = [...$frames].filter((frame) => {
        try {
          return JSON.parse(frame.getAttribute('data-frame-id'))[0] === codegenStory
        }
        catch { return false }
      })
      expect(codegenFrames).to.have.length(codegenVariants.length)
    })
    cy.window().then((window) => {
      nearestFirst = nearestSiblingOrder(window)
    })
    cy.get(`${frameSelector(codegenStory, 'html')} .histoire-frame-content`, { timeout: 30000 })
      .should('have.attr', 'aria-busy', 'false')
    expectAllFramesReady(codegenStory, codegenVariants)

    cy.window().then((window) => {
      const readyAtByVariant = window.__crossStoryAdmissionProof.readyAtByVariant
      const readyAt = readyAtByVariant.html
      const siblings = requests.filter(row => row.variantId !== 'html')
      expect(requests).to.have.length(codegenVariants.length)
      expect(Object.keys(readyAtByVariant).sort()).to.deep.equal([...codegenVariants].sort())
      expect(siblings.every(row => row.startedAt >= readyAt), 'siblings start after selected host readiness').to.equal(true)

      expect(siblings.map(row => row.variantId), 'sibling request order follows geometric distance').to.deep.equal(nearestFirst)
      const events = siblings.flatMap(row => [
        { time: row.startedAt, type: 'start' },
        { time: readyAtByVariant[row.variantId], type: 'ready' },
      ]).sort((a, b) => a.time - b.time || (a.type === b.type ? 0 : a.type === 'ready' ? -1 : 1))
      let pending = 0
      let maxPending = 0
      for (const event of events) {
        pending += event.type === 'start' ? 1 : -1
        maxPending = Math.max(maxPending, pending)
      }
      expect(maxPending, 'no more than two sibling runtimes are pending host readiness').to.be.at.most(2)
    })
  })

  it('keeps cross-story documents isolated and restores selected controls through A/B/A', () => {
    cy.visit(`/story/${baseStory}?variantId=${baseVariants[0]}&arrange=grid`, {
      onBeforeLoad(window) {
        window.localStorage.setItem('_histoire-ui-shell', JSON.stringify({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: 280, inspectorWidth: 344 }))
      },
    })
    expectAllFramesReady(baseStory, baseVariants)
    let baseFirst
    let codegenFirst
    captureFrameDocument(baseStory, baseVariants[0]).then((frame) => {
      baseFirst = frame
    })
    cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Disabled"]').should('have.attr', 'aria-checked', 'false').click().should('have.attr', 'aria-checked', 'true')

    selectStory(codegenStory)
    expectAllFramesReady(codegenStory, codegenVariants)
    selectCanvasVariant('html', 'html')
    cy.location('search').should('include', 'variantId=html')
    captureFrameDocument(codegenStory, 'html').then((frame) => {
      codegenFirst = frame
    })
    cy.get('.cm-editor').should('be.visible')
    getGeneratedSource().should('contain', 'data-test-id="object"')
    cy.then(() => expect(baseFirst.iframe.isConnected, 'BaseButton document retired after story change').to.equal(false))

    selectStory(baseStory)
    expectAllFramesReady(baseStory, baseVariants)
    selectCanvasVariant('playground', baseVariants[0])
    cy.then(() => expect(codegenFirst.iframe.isConnected, 'Code gen document retired after story change').to.equal(false))
    captureFrameDocument(baseStory, baseVariants[0]).then((frame) => {
      expect(frame.documentId, 'new BaseButton document after returning').not.to.equal(baseFirst.documentId)
    })
    cy.getControlsIframeBody().find('[role="checkbox"][aria-label="Disabled"]').should('have.attr', 'aria-checked', 'true')
    cy.getPreviewIframeBody().contains('button', 'Click me').should('be.disabled')
    cy.get('iframe[title="Histoire custom controls"]').should(($frame) => {
      const url = new URL($frame[0].contentWindow.location.href)
      expect(url.searchParams.get('storyId')).to.equal(baseStory)
      expect(url.searchParams.get('variantId')).to.equal(baseVariants[0])
    })

    selectStory(codegenStory)
    expectAllFramesReady(codegenStory, codegenVariants)
    selectCanvasVariant('html', 'html')
    captureFrameDocument(codegenStory, 'html').then((frame) => {
      expect(frame.documentId, 'new Code gen document after returning').not.to.equal(codegenFirst.documentId)
    })
  })
})
