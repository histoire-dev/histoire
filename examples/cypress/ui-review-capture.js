/// <reference types="cypress" />

/** Decode only requested Vite custom event without changing transport delivery. */
function customEvent(payload, event) {
  try {
    const value = JSON.parse(payload)
    return value.type === 'custom' && value.event === event ? value.data : undefined
  }
  catch { return undefined }
}

/** Observe responses on existing ready sockets; capture remains real server/browser work. */
export function observeScreenshotReplies() {
  const replies = []
  cy.get('@screenshotWire').should((wire) => {
    expect(wire.getCalls().some(call => customEvent(call.args[0], 'histoire:ui:ready')), 'ready development socket').to.equal(true)
  }).then((wire) => {
    const sockets = new Set(wire.getCalls().filter(call => customEvent(call.args[0], 'histoire:ui:ready')).map(call => call.thisValue))
    for (const socket of sockets) {
      /** Passive observation preserves application result handling and ACK correlation. */
      socket.addEventListener('message', (event) => {
        const reply = customEvent(event.data, 'histoire:ui:screenshot-result')
        if (reply) replies.push(reply)
      })
    }
    cy.wrap(replies, { log: false }).as('screenshotReplies')
  })
}

/**
 * Verify exact request, correlated file identity, and real captured PNG bytes.
 * @param {boolean} emphasized Actual advertised column value.
 * @param {string} alias Binary response alias, used to compare output images.
 */
export function captureMatrixCell(emphasized, alias) {
  const storyId = 'src-components-workbenchmatrix-story-vue'
  const frameKey = JSON.stringify([storyId, 'enabled', false, 'emphasized', emphasized])
  let requestId
  let file
  // Existing capture panel can cover next cell, so dismiss before real pointer selection.
  cy.get('[aria-label="Screenshot"][aria-haspopup="dialog"]').then(($trigger) => {
    if ($trigger.attr('aria-expanded') === 'true') cy.wrap($trigger).click()
  })
  cy.get('[role="dialog"][aria-label="Screenshot"]').should('not.exist')
  cy.get(`[aria-label="Select matrix cell false · ${emphasized}"]`).click().should('have.attr', 'aria-pressed', 'true').parent().find('iframe').should(($frame) => {
    const content = $frame[0].contentDocument?.querySelector('[data-test-id="matrix-values"]')
    expect(content?.textContent).to.contain(`Matrix capture override · enabled=false · emphasized=${emphasized}`)
  })
  // Open only after selection, using actual toolbar state instead of toggling blindly.
  cy.get('[aria-label="Screenshot"][aria-haspopup="dialog"]').then(($trigger) => {
    if ($trigger.attr('aria-expanded') !== 'true') cy.wrap($trigger).click()
  })
  cy.get('[role="dialog"][aria-label="Screenshot"]').should('be.visible')
  cy.contains('[aria-label="Screenshot format"] button', /^PNG$/).click()
  cy.contains('[role="dialog"][aria-label="Screenshot"] button', /^Capture 1 frame$/).click()
  cy.get('@screenshotWire').should((wire) => {
    const requests = wire.getCalls().map(call => customEvent(call.args[0], 'histoire:ui:screenshot')).filter(Boolean)
    const request = requests.at(-1)
    expect(request?.targets).to.have.length(1)
    expect(request.targets[0]).to.include({ storyId, variantId: 'default', frameKey })
    expect(request.targets[0].propsOverride).to.include({ enabled: false, emphasized, message: 'Matrix capture override' })
    expect(request.format).to.equal('png')
    expect(request.requestId).to.be.a('string').and.not.equal('')
  }).then((wire) => {
    requestId = wire.getCalls().map(call => customEvent(call.args[0], 'histoire:ui:screenshot')).filter(Boolean).at(-1).requestId
  })
  cy.get('@screenshotReplies', { timeout: 60000 }).should((replies) => {
    const reply = replies.find(reply => reply.requestId === requestId)
    expect(reply, 'result for exact capture request').to.be.an('object')
    expect(reply).not.to.have.property('error')
    expect(reply.errors ?? []).to.have.length(0)
    expect(reply.files).to.have.length(1)
    expect(reply.files[0]).to.include({ storyId, variantId: 'default', frameKey })
  }).then((replies) => {
    file = replies.find(reply => reply.requestId === requestId).files[0]
  })
  cy.contains('[role="dialog"][aria-label="Screenshot"] [role="status"]', '1 frame captured', { timeout: 60000 }).should('be.visible')
  cy.then(() => {
    const name = encodeURIComponent(file.path.split('/').pop())
    cy.get(`[role="dialog"][aria-label="Screenshot"] img[src$="/${name}"]`).should(($image) => {
      expect($image[0].naturalWidth).to.be.greaterThan(0)
    }).invoke('attr', 'src').then((url) => {
      cy.request({ url, encoding: 'binary' }).then((response) => {
        expect(response.headers['content-type']).to.equal('image/png')
        expect(response.body.slice(0, 8)).to.equal('\x89PNG\r\n\x1A\n')
        cy.wrap(response.body).as(alias)
      })
    })
  })
}
