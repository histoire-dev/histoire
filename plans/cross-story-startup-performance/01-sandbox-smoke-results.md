# Slice 1 browser smoke

Commands were run from `/home/akryum/Projects/histoire/examples/vue3`, with Cypress 13.17.0, Chrome 157 headless, and Node 24.16.0. Cypress output was captured in the interactive command output; no report/log file was written. Cypress screenshots from the failed selector attempts were not retained.

Dev smoke against `http://127.0.0.1:6090`:

```sh
env PATH="/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.vite-plus/bin:/usr/bin:/bin" ./node_modules/.bin/cypress run --browser chrome --spec "cypress/e2e/codegen-vue3.cy.js,cypress/e2e/vitest-story.cy.js,cypress/e2e/controls.cy.js" --config "baseUrl=http://127.0.0.1:6090"
```

`codegen-vue3.cy.js` passed 11/11 and `controls.cy.js` passed 5/5. `vitest-story.cy.js` failed 2/2 before story navigation: `cy.openVitestStory()` and the controls test could not find the “Vitest Mocking” row in the virtualized home story list. Direct route checks below reached and exercised that story successfully.

Static smoke served from the final `examples/vue3/.histoire/dist` on `http://localhost:6092`:

```sh
env PATH="/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.vite-plus/bin:/usr/bin:/bin" ./node_modules/.bin/cypress run --browser chrome --spec "cypress/e2e/codegen-vue3.cy.js,cypress/e2e/controls.cy.js" --config "baseUrl=http://localhost:6092"
```

Both specs passed, 16/16 total.

Focused direct-route browser probe, runnable against dev or static build:

```sh
/home/akryum/.local/share/mise/installs/node/24.16.0/bin/node plans/cross-story-startup-performance/smoke-direct-routes.mjs http://127.0.0.1:6090
/home/akryum/.local/share/mise/installs/node/24.16.0/bin/node plans/cross-story-startup-performance/smoke-direct-routes.mjs http://localhost:6092
```

The probe passed on both targets with no page errors. It checked the Vitest-mocked story and embedded control edit, `HstJson` lazy editor loading and model update, and generated-to-story-file source switching. The reproducible probe is [smoke-direct-routes.mjs](./smoke-direct-routes.mjs).
